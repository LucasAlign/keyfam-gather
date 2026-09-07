import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffAssignmentRow } from "@/components/staff-assignment-row";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StaffingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, name: true } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "event:manage", eventId);

  const [members, assignments, recentCheckIns] = await Promise.all([
    db.membership.findMany({ where: { organizationId: event.organizationId }, include: { user: { select: { id: true, name: true, email: true } } } }),
    db.eventAssignment.findMany({ where: { eventId, organizationId: event.organizationId }, select: { userId: true, role: true } }),
    // Recent, still-valid check-ins power the "active stations" view (issue #18).
    db.checkIn.findMany({ where: { eventId, reversedAt: null }, orderBy: { checkedInAt: "desc" }, take: 300, select: { deviceId: true, checkedInAt: true, actor: { select: { name: true } } } }),
  ]);

  const roleByUser = new Map(assignments.map((assignment) => [assignment.userId, assignment.role]));
  const rows = members
    .map((membership) => ({ user: membership.user, role: roleByUser.get(membership.user.id) ?? null }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const stations = new Map<string, { deviceId: string; count: number; lastAt: Date; lastActor: string }>();
  for (const record of recentCheckIns) {
    const current = stations.get(record.deviceId);
    if (current) current.count += 1;
    else stations.set(record.deviceId, { deviceId: record.deviceId, count: 1, lastAt: record.checkedInAt, lastActor: record.actor.name });
  }
  const activeStations = [...stations.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  void access;

  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Event staffing</p><h1>Assign event-night roles</h1><p className="lede">Give each helper only what their station needs. Volunteers get a focused check-in view; check-in leads can also run walk-ins, corrections, seat moves, overrides, and escalations.</p></div></div>

    <section className="event-section">
      <div className="section-heading"><h2>Team</h2><span>{rows.length}</span></div>
      <div className="staff-list">{rows.map((row) => <StaffAssignmentRow key={row.user.id} eventId={eventId} userId={row.user.id} name={row.user.name} email={row.user.email} currentRole={row.role} />)}</div>
    </section>

    <section className="event-section">
      <div className="section-heading"><h2>Active check-in stations</h2><span>{activeStations.length}</span></div>
      {activeStations.length === 0
        ? <div className="empty compact"><h3>No check-in activity yet</h3><p>Stations appear here once staff begin checking guests in on their devices.</p></div>
        : <div className="station-list">{activeStations.map((station) => <article key={station.deviceId} className="station-card">
            <div><strong>{station.deviceId}</strong><p>Last check-in by {station.lastActor}</p></div>
            <span>{station.count} check-in{station.count === 1 ? "" : "s"} · {new Intl.DateTimeFormat("en-US", { timeStyle: "short", dateStyle: "medium" }).format(station.lastAt)}</span>
          </article>)}</div>}
    </section>
  </div>;
}
