import Link from "next/link";
import { redirect } from "next/navigation";
import { EventTemplateGallery } from "@/components/event-template-gallery";
import { AuthorizationError, getActorAccess, getCurrentOrganization } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  let organization: Awaited<ReturnType<typeof getCurrentOrganization>> | undefined;
  try {
    organization = await getCurrentOrganization();
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }
  if (!organization) redirect("/login");
  const access = await getActorAccess(organization.id);
  const canViewEveryEvent = access.can("event:view");
  const canCreateEvent = access.can("event:create");
  const events = await db.event.findMany({ where: { organizationId: organization.id, ...(canViewEveryEvent ? {} : { id: { in: access.eventAssignments.map(({ eventId }) => eventId) } }) }, orderBy: { startsAt: "asc" }, include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } });
  return <><div className="page-heading"><div><p className="eyebrow">{organization.name}</p><h1>Events</h1><p>Plan an event, welcome guests, and keep everyone together.</p></div>{canCreateEvent && <Link className="button" href="/events/new">Create event</Link>}</div>
    {canCreateEvent && <EventTemplateGallery heading={events.length === 0 ? "Start your first event" : "Start a new event"} />}
    {events.length === 0 ? <section className="empty"><div className="empty-icon">✦</div><h2>Your first gathering starts here</h2><p>Pick a template above, or start from scratch.</p></section> : <><div className="section-heading"><h2>Your events</h2><span>{events.length}</span></div><div className="event-grid">{events.map((event) => <Link className="event-card" href={`/events/${event.id}`} key={event.id}><span className="status">{event.status.replaceAll("_", " ")}</span><h2>{event.name}</h2><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)}</p><strong>{event._count.registrations} registered</strong></Link>)}</div></>}
  </>;
}
