import Link from "next/link";
import { notFound } from "next/navigation";
import { EventConfigurationForm } from "@/components/event-configuration-form";
import { RegistrationFieldManager } from "@/components/registration-field-manager";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextEventStatus } from "@/lib/event-configuration";

export const dynamic = "force-dynamic";

export default async function EventSettingsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ duplicated?: string; rolledover?: string; drafted?: string; skipped?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrationFields: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } }, rolledOverFrom: { select: { id: true, name: true } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "event:manage", eventId);
  const status = await searchParams;
  const drafted = Number(status.drafted ?? 0);
  const skipped = Number(status.skipped ?? 0);
  return <>
    <Link className="back" href={`/events/${event.id}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Event configuration</p><h1>Plan the whole event</h1><p>Keep registration access, event-night details, contact information, and branding in one place.</p></div>{access.can("event:create") && <Link className="button secondary" href={`/events/${event.id}/rollover`}>Roll over to next year</Link>}</div>
    {status.duplicated && <div className="success" role="status">Draft event created from the source configuration.</div>}
    {status.rolledover && <div className="success" role="status">Next-year draft created and linked to the prior event.{drafted > 0 ? ` ${drafted} renewal invitation${drafted === 1 ? "" : "s"} drafted (review and send when ready).` : " No renewal invitations were drafted."}{skipped > 0 ? ` ${skipped} selected contact${skipped === 1 ? "" : "s"} skipped for missing email or phone.` : ""}</div>}
    {event.rolledOverFrom && <p className="form-hint">Rolled over from <Link href={`/events/${event.rolledOverFrom.id}`}>{event.rolledOverFrom.name}</Link> for year-over-year reporting.</p>}
    <EventConfigurationForm event={event} nextStatus={nextEventStatus(event.status)} canDuplicate={access.can("event:create")} />
    <RegistrationFieldManager eventId={event.id} fields={event.registrationFields} />
  </>;
}
