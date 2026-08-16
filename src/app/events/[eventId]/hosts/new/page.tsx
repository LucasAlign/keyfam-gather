import Link from "next/link";
import { notFound } from "next/navigation";
import { revokeHostAccess, rotateHostAccess } from "@/app/host-actions";
import { GroupForm } from "@/components/group-form";
import { HostForm } from "@/components/host-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function NewHostPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ access?: string; groupCreated?: string }>;
}) {
  const { eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      groups: { include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } }, orderBy: { name: "asc" } },
      eventHosts: {
        include: { person: true, group: true, accessTokens: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!event) notFound();
  await requireActor(event.organizationId, "host:manage", eventId);
  const { access, groupCreated } = await searchParams;
  const now = new Date();

  return <div className="narrow">
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Hosts & groups</p><h1>Welcome a host</h1><p>Create a group automatically or connect the host to an existing group.</p></div></div>
    {access && <div className="access-card" role="status"><h2>Host access is ready</h2><p>Share this private link securely. It expires in 30 days and should be treated like a password.</p><Link className="portal-link" href={`/host/${access}`}>Open host portal</Link></div>}
    {groupCreated && <div className="success" role="status">Group created successfully.</div>}
    {event.eventHosts.length > 0 && <section>
      <div className="section-heading"><h2>Host access</h2><span>{event.eventHosts.length}</span></div>
      <div className="invitation-list compact-list">{event.eventHosts.map((host) => {
        const current = host.accessTokens.find((token) => !token.revokedAt && token.expiresAt > now);
        const rotatable = current ?? host.accessTokens[0];
        return <article key={host.id}>
          <div><strong>{host.person.firstName} {host.person.lastName}</strong><p>{host.group.name}{current?.lastUsedAt ? ` · Last used ${current.lastUsedAt.toLocaleString()}` : " · Not used yet"}</p></div>
          <span className="invitation-status">{current ? "Active" : "Inactive"}</span>
          <div className="invitation-actions">
            {current && <form action={revokeHostAccess}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="tokenId" value={current.id} /><button type="submit">Revoke</button></form>}
            <form action={rotateHostAccess}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="tokenId" value={rotatable?.id ?? ""} /><button type="submit" disabled={!rotatable}>Rotate link</button></form>
          </div>
        </article>;
      })}</div>
    </section>}
    <HostForm eventId={eventId} groups={event.groups.map((group) => ({ id: group.id, name: group.name, capacity: group.capacity, occupied: group._count.registrations }))} />
    <GroupForm eventId={eventId} />
  </div>;
}
