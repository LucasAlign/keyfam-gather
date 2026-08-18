import Link from "next/link";
import { notFound } from "next/navigation";
import { EventConfigurationForm } from "@/components/event-configuration-form";
import { RegistrationFieldManager } from "@/components/registration-field-manager";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextEventStatus } from "@/lib/event-configuration";

export const dynamic = "force-dynamic";

export default async function EventSettingsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ duplicated?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrationFields: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "event:manage", eventId);
  const status = await searchParams;
  return <>
    <Link className="back" href={`/events/${event.id}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Event configuration</p><h1>Plan the whole event</h1><p>Keep registration access, event-night details, contact information, and branding in one place.</p></div></div>
    {status.duplicated && <div className="success" role="status">Draft event created from the source configuration.</div>}
    <EventConfigurationForm event={event} nextStatus={nextEventStatus(event.status)} canDuplicate={access.can("event:create")} />
    <RegistrationFieldManager eventId={event.id} fields={event.registrationFields} />
  </>;
}
