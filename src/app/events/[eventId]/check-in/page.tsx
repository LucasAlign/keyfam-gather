import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckInWorkspace } from "@/components/check-in-workspace";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrations: { include: { person: true, group: true, table: true, party: true, checkIn: { include: { actor: true } } }, orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }] }, groups: { include: { _count: { select: { registrations: true } } }, orderBy: { name: "asc" } }, seatingTables: { include: { _count: { select: { registrations: true } } }, orderBy: { name: "asc" } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "checkin:manage", eventId);
  const checkedIn = event.registrations.filter((item) => item.checkIn?.reversedAt === null).length;
  const walkIns = event.registrations.filter((item) => item.source === "WALK_IN").length;
  const registrants = event.registrations.map((item) => ({ id: item.id, name: `${item.person.firstName} ${item.person.lastName}`, email: item.person.email, phone: item.person.phone, group: item.group?.name ?? null, table: item.table?.name ?? null, party: item.party?.name ?? null, attendanceVersion: item.checkIn?.version ?? 0, checkIn: item.checkIn?.reversedAt === null ? { checkedInAt: item.checkIn.checkedInAt.toISOString(), actor: item.checkIn.actor.name, deviceId: item.checkIn.deviceId, version: item.checkIn.version } : null }));
  return <><Link className="back" href={`/events/${eventId}`}>← {event.name}</Link><div className="page-heading"><div><p className="eyebrow">Live attendance</p><h1>Check in guests</h1><p>Search first, confirm the person, then use the large check-in control.</p></div></div>
    <section className="seating-summary checkin-summary"><div><strong>{event.registrations.length}</strong><span>Registered</span></div><div><strong>{checkedIn}</strong><span>Checked in</span></div><div><strong>{event.registrations.length - checkedIn}</strong><span>Not arrived</span></div><div><strong>{walkIns}</strong><span>Walk-ins</span></div><div><strong>{event.registrations.length ? `${Math.round(checkedIn / event.registrations.length * 100)}%` : "0%"}</strong><span>Attendance</span></div></section>
    <CheckInWorkspace eventId={eventId} userId={access.user.id} registrants={registrants} canManageWalkIns={access.can("walkin:manage")} groups={event.groups.map((group) => ({ id: group.id, name: group.name, detail: group.capacity === null ? `${group._count.registrations} registered` : `${Math.max(group.capacity - group._count.registrations, 0)} left` }))} tables={event.seatingTables.map((table) => ({ id: table.id, name: table.name, detail: `${table._count.registrations}/${table.capacity}` }))} />
  </>;
}
