import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function RegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { groups: { orderBy: { name: "asc" } }, parties: { orderBy: { name: "asc" } }, seatingTables: { include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } }, orderBy: { name: "asc" } }, registrationFields: { where: { isActive: true }, include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "registration:create", eventId);
  return <div className="narrow"><Link className="back" href={`/events/${event.id}`}>← {event.name}</Link><p className="eyebrow">Staff registration</p><h1>Add a registrant</h1><p className="lede">We’ll check for an existing Person before creating a new record. A Group describes their event context, a Party keeps people together, and a Table is their seat destination.</p><RegistrationForm eventId={event.id} fields={event.registrationFields} canResolve={access.can("person:resolve")} canAssign={access.can("seating:manage")} groups={event.groups} parties={event.parties} tables={event.seatingTables.map((table) => ({ id: table.id, name: table.name, capacity: table.capacity, occupied: table._count.registrations }))} /></div>;
}
