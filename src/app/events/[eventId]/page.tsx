import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ registered?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrations: { include: { person: true }, orderBy: { registeredAt: "desc" } } } });
  if (!event) notFound();
  await requireActor(event.organizationId, "event:view");
  const { registered } = await searchParams;
  return <><Link className="back" href="/">← Events</Link>{registered && <div className="success" role="status">Registrant added successfully.</div>}<div className="page-heading"><div><span className="status">{event.status.replaceAll("_", " ")}</span><h1>{event.name}</h1><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)}{event.venue ? ` · ${event.venue}` : ""}</p></div><Link className="button" href={`/events/${event.id}/register`}>Add registrant</Link></div>
    <section className="metrics"><div><strong>{event.registrations.length}</strong><span>Registered</span></div><div><strong>{event.capacity ? Math.max(event.capacity - event.registrations.length, 0) : "—"}</strong><span>Seats remaining</span></div></section>
    <section><div className="section-heading"><h2>Registrants</h2><span>{event.registrations.length}</span></div>{event.registrations.length === 0 ? <div className="empty compact"><h3>No one is registered yet</h3><p>Add the first person to this event.</p><Link className="button secondary" href={`/events/${event.id}/register`}>Add first registrant</Link></div> : <div className="registrants">{event.registrations.map(({ id, person }) => <article key={id}><div className="avatar">{person.firstName[0]}{person.lastName[0]}</div><div><strong>{person.firstName} {person.lastName}</strong><p>{person.email ?? person.phone}</p></div><span>Registered</span></article>)}</div>}</section>
  </>;
}
