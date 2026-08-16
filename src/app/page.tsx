import Link from "next/link";
import { getActorAccess, getCurrentOrganization } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const organization = await getCurrentOrganization();
  const access = await getActorAccess(organization.id);
  const canViewEveryEvent = access.can("event:view");
  const events = await db.event.findMany({ where: { organizationId: organization.id, ...(canViewEveryEvent ? {} : { id: { in: access.eventAssignments.map(({ eventId }) => eventId) } }) }, orderBy: { startsAt: "asc" }, include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } });
  return <><div className="page-heading"><div><p className="eyebrow">{organization.name}</p><h1>Events</h1><p>Plan an event, welcome guests, and keep everyone together.</p></div><Link className="button" href="/events/new">Create event</Link></div>
    {events.length === 0 ? <section className="empty"><div className="empty-icon">✦</div><h2>Your first gathering starts here</h2><p>Create an event, then add its first registrant.</p><Link className="button" href="/events/new">Create your first event</Link></section> : <div className="event-grid">{events.map((event) => <Link className="event-card" href={`/events/${event.id}`} key={event.id}><span className="status">{event.status.replaceAll("_", " ")}</span><h2>{event.name}</h2><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)}</p><strong>{event._count.registrations} registered</strong></Link>)}</div>}
  </>;
}
