import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ registered?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrations: { include: { person: true, group: true, checkIn: true }, orderBy: { registeredAt: "desc" } }, groups: { include: { hosts: { include: { person: true } }, _count: { select: { registrations: true } } }, orderBy: { name: "asc" } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "event:view", eventId);
  const { registered } = await searchParams;
  const checkedIn = event.registrations.filter(({ checkIn }) => checkIn?.reversedAt === null).length;
  const walkIns = event.registrations.filter(({ source }) => source === "WALK_IN").length;
  return <><Link className="back" href="/">← Events</Link>{registered && <div className="success" role="status">Registrant added successfully.</div>}<div className="page-heading"><div><span className="status">{event.status.replaceAll("_", " ")}</span><h1>{event.name}</h1><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)}{event.venue ? ` · ${event.venue}` : ""}</p></div><div className="button-row"><Link className="button" href={`/events/${event.id}/check-in`}>Open check-in</Link>{access.can("invitation:manage") && <Link className="button secondary" href={`/events/${event.id}/invitations`}>Invitations</Link>}{access.can("nametag:manage") && <Link className="button secondary" href={`/events/${event.id}/name-tags`}>Name tags</Link>}<Link className="button secondary" href={`/events/${event.id}/seating`}>Tables & seating</Link><Link className="button secondary" href={`/events/${event.id}/hosts/new`}>Hosts & groups</Link><Link className="button" href={`/events/${event.id}/register`}>Add registrant</Link></div></div>
    <section className="metrics"><div><strong>{event.registrations.length}</strong><span>Registered</span></div><div><strong>{checkedIn}</strong><span>Checked in</span></div><div><strong>{event.registrations.length - checkedIn}</strong><span>Not arrived</span></div><div><strong>{walkIns}</strong><span>Walk-ins</span></div></section>
    {event.groups.length > 0 && <section className="event-section"><div className="section-heading"><h2>Groups</h2><span>{event.groups.length}</span></div><div className="group-grid">{event.groups.map((group) => <article className="group-card" key={group.id}><div><strong>{group.name}</strong><p>{group.hosts.length ? `Hosted by ${group.hosts.map((host) => `${host.person.firstName} ${host.person.lastName}`).join(", ")}` : "No host assigned"}</p></div><span>{group.capacity === null ? `${group._count.registrations} registered` : `${Math.max(group.capacity - group._count.registrations, 0)} seats left`}</span></article>)}</div></section>}
    <section><div className="section-heading"><h2>Registrants</h2><span>{event.registrations.length}</span></div>{event.registrations.length === 0 ? <div className="empty compact"><h3>No one is registered yet</h3><p>Add the first person to this event.</p><Link className="button secondary" href={`/events/${event.id}/register`}>Add first registrant</Link></div> : <div className="registrants">{event.registrations.map(({ id, person, group, checkIn }) => <article key={id}><div className="avatar">{person.firstName[0]}{person.lastName[0]}</div><div><strong>{person.firstName} {person.lastName}</strong><p>{person.email ?? person.phone}{group ? ` · ${group.name}` : ""}</p></div><span>{checkIn?.reversedAt === null ? "Checked in" : "Registered"}</span></article>)}</div>}</section>
  </>;
}
