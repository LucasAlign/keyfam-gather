import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationEditor } from "@/components/registration-editor";
import { PersonMergeForm } from "@/components/person-merge-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: {
    id: true, organizationId: true, name: true,
    registrations: { include: { person: true, group: true, table: true, party: true, checkIn: true }, orderBy: [{ status: "asc" }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }] },
  } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "registration:manage", eventId);
  const active = event.registrations.filter((registration) => registration.status === "ACTIVE");
  const cancelled = event.registrations.filter((registration) => registration.status === "CANCELLED");
  const card = (registration: typeof event.registrations[number]) => <article className={`registration-management-card ${registration.status === "CANCELLED" ? "is-cancelled" : ""}`} key={registration.id}>
    <div><strong>{registration.person.firstName} {registration.person.lastName}</strong><p>{registration.person.email ?? registration.person.phone}</p><small>{[registration.group?.name, registration.table?.name, registration.party?.name].filter(Boolean).join(" · ") || "No group or seating assignment"}{registration.checkIn?.reversedAt === null ? " · Checked in" : ""}</small></div>
    <span className="invitation-status">{registration.status === "ACTIVE" ? "Active" : `Cancelled ${registration.cancelledAt?.toLocaleString() ?? ""}`}</span>
    <RegistrationEditor registration={{ id: registration.id, status: registration.status, firstName: registration.person.firstName, lastName: registration.person.lastName, email: registration.person.email, phone: registration.person.phone }} context={{ kind: "staff", eventId }} />
  </article>;
  return <><Link className="back" href={`/events/${eventId}`}>← {event.name}</Link><div className="page-heading"><div><p className="eyebrow">Registration lifecycle</p><h1>Manage registrants</h1><p>Correct guest details, cancel registrations without deleting history, and safely restore them.</p></div><Link className="button" href={`/events/${eventId}/register`}>Add registrant</Link></div>
    <section><div className="section-heading"><h2>Active registrations</h2><span>{active.length}</span></div>{active.length ? <div className="registration-management-list">{active.map(card)}</div> : <div className="empty compact"><h3>No active registrations</h3></div>}</section>
    {cancelled.length > 0 && <section className="event-section"><div className="section-heading"><h2>Cancelled registrations</h2><span>{cancelled.length}</span></div><div className="registration-management-list">{cancelled.map(card)}</div></section>}
    {access.can("person:resolve") && <PersonMergeForm eventId={eventId} people={Array.from(new Map(event.registrations.filter((registration) => registration.person.mergedIntoPersonId === null).map((registration) => [registration.person.id, { id: registration.person.id, name: `${registration.person.firstName} ${registration.person.lastName}` }])).values())} />}
  </>;
}
