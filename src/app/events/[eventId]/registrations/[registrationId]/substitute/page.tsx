import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestSubstitutionForm, type SubstitutionPerson } from "@/components/guest-substitution-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SubstitutionOriginal, TargetTableCapacity } from "@/lib/substitution";

export const dynamic = "force-dynamic";

export default async function SubstituteGuestPage({ params }: { params: Promise<{ eventId: string; registrationId: string }> }) {
  const { eventId, registrationId } = await params;
  const registration = await db.registration.findFirst({
    where: { id: registrationId, eventId },
    include: {
      person: { select: { id: true, firstName: true, lastName: true } },
      group: { select: { name: true } },
      party: { select: { name: true } },
      table: { select: { name: true, capacity: true, _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } },
      checkIn: { select: { reversedAt: true } },
      invitation: { select: { id: true } },
      event: { select: { organizationId: true, name: true } },
    },
  });
  if (!registration) notFound();
  await requireActor(registration.event.organizationId, "registration:manage", eventId);

  if (registration.status !== "ACTIVE") {
    return <div className="narrow"><Link className="back" href={`/events/${eventId}/registrations`}>← Manage registrants</Link><div className="empty compact"><h3>This registration isn&apos;t active</h3><p>Only an active registration can be substituted.</p></div></div>;
  }

  const original: SubstitutionOriginal = {
    personName: `${registration.person.firstName} ${registration.person.lastName}`,
    groupName: registration.group?.name ?? null,
    partyName: registration.party?.name ?? null,
    tableName: registration.table?.name ?? null,
    hasInvitation: registration.invitation !== null,
    isCheckedIn: registration.checkIn?.reversedAt === null && registration.checkIn !== null,
  };
  const targetTable: TargetTableCapacity | null = registration.table
    ? { name: registration.table.name, capacity: registration.table.capacity, activeExcludingOriginal: Math.max(registration.table._count.registrations - 1, 0) }
    : null;

  // Candidate replacements: everyone in the org except the current guest and
  // people already actively registered for this event.
  const activePersonIds = new Set((await db.registration.findMany({ where: { eventId, status: "ACTIVE" }, select: { personId: true } })).map((row) => row.personId));
  const people = await db.person.findMany({ where: { organizationId: registration.event.organizationId, mergedIntoPersonId: null, id: { not: registration.person.id } }, select: { id: true, firstName: true, lastName: true, email: true, phone: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500 });
  const candidatePeople: SubstitutionPerson[] = people
    .filter((person) => !activePersonIds.has(person.id))
    .map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}`, detail: person.email ?? person.phone ?? "" }));

  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${eventId}/registrations`}>← Manage registrants</Link>
    <div className="page-heading"><div><p className="eyebrow">Guest substitution</p><h1>Replace {original.personName}</h1><p className="lede">Swap in another guest while keeping this seat&apos;s Group, Party, Table, and Invitation. The original registration is superseded and stays in the audit trail.</p></div></div>
    <GuestSubstitutionForm
      eventId={eventId}
      registrationId={registrationId}
      original={original}
      hasGroup={registration.group !== null}
      hasParty={registration.party !== null}
      hasTable={registration.table !== null}
      targetTable={targetTable}
      people={candidatePeople}
    />
  </div>;
}
