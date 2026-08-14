import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { getEventDashboard } from "@/lib/event-dashboard";

export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ registered?: string }> }) {
  const { eventId } = await params;
  const workspace = await getEventDashboard(eventId);
  if (!workspace) notFound();
  const { event, access, metrics } = workspace;
  const { registered } = await searchParams;
  return <>
    <LiveRefresh />
    <Link className="back" href="/">← Events</Link>
    {registered && <div className="success" role="status">Registrant added successfully.</div>}
    <div className="page-heading"><div><span className="status">{event.status.replaceAll("_", " ")}</span><h1>{event.name}</h1><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)}{event.venue ? ` · ${event.venue}` : ""}</p><small className="live-note">Live dashboard · refreshes every 5 seconds</small></div><div className="button-row"><Link className="button" href={`/events/${event.id}/check-in`}>Open check-in</Link><Link className="button secondary" href={`/events/${event.id}/reports`}>Reports & exports</Link>{access.can("invitation:manage") && <Link className="button secondary" href={`/events/${event.id}/invitations`}>Invitations</Link>}{access.can("nametag:manage") && <Link className="button secondary" href={`/events/${event.id}/name-tags`}>Name tags</Link>}<Link className="button secondary" href={`/events/${event.id}/seating`}>Tables & seating</Link><Link className="button secondary" href={`/events/${event.id}/hosts/new`}>Hosts & groups</Link><Link className="button" href={`/events/${event.id}/register`}>Add registrant</Link></div></div>
    <section className="metrics dashboard-metrics" aria-label="Event attendance metrics"><div><strong>{metrics.registered}</strong><span>Registered</span></div><div><strong>{metrics.checkedIn}</strong><span>Checked in</span></div><div><strong>{metrics.attendancePercent}%</strong><span>Attendance</span></div><div><strong>{metrics.notArrived}</strong><span>Not arrived</span></div><div><strong>{metrics.walkIns}</strong><span>Walk-ins</span></div><div className={metrics.unassignedGuests ? "metric-attention" : ""}><strong>{metrics.unassignedGuests}</strong><span>Unassigned guests</span></div><div className={metrics.tableIssues ? "metric-attention" : ""}><strong>{metrics.tableIssues}</strong><span>Table issues</span></div></section>
    {event.groups.length > 0 && <section className="event-section"><div className="section-heading"><h2>Groups</h2><span>{event.groups.length}</span></div><div className="group-grid">{event.groups.map((group) => <article className="group-card" key={group.id}><div><strong>{group.name}</strong><p>{group.hosts.length ? `Hosted by ${group.hosts.map((host) => `${host.person.firstName} ${host.person.lastName}`).join(", ")}` : "No host assigned"}</p></div><span>{group.capacity === null ? `${group._count.registrations} registered` : `${Math.max(group.capacity - group._count.registrations, 0)} seats left`}</span></article>)}</div></section>}
    <section><div className="section-heading"><h2>Registrants</h2><span>{event.registrations.length}</span></div>{event.registrations.length === 0 ? <div className="empty compact"><h3>No one is registered yet</h3><p>Add the first person to this event.</p><Link className="button secondary" href={`/events/${event.id}/register`}>Add first registrant</Link></div> : <div className="registrants">{event.registrations.map(({ id, person, group, checkIn }) => <article key={id}><div className="avatar">{person.firstName[0]}{person.lastName[0]}</div><div><strong>{person.firstName} {person.lastName}</strong><p>{person.email ?? person.phone}{group ? ` · ${group.name}` : ""}</p></div><span>{checkIn && !checkIn.reversedAt ? "Checked in" : "Registered"}</span></article>)}</div>}</section>
  </>;
}
