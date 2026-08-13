import { cancelHostInvitation, resendHostInvitation } from "@/app/invitation-actions";
import { HostGuestForm } from "@/components/host-guest-form";
import { HostInvitationForm } from "@/components/host-invitation-form";
import { db } from "@/lib/db";
import { assertHostScope, hashHostToken, isHostTokenActive, remainingSeats } from "@/lib/host-access";
import { invitationCanManage, invitationStatusLabel } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function HostPortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ registered?: string; invited?: string; inviteToken?: string }> }) {
  const { token } = await params;
  const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(token) }, include: { eventHost: { include: { person: true, event: true, group: { include: { registrations: { include: { person: true }, orderBy: { registeredAt: "desc" } }, invitations: { orderBy: { createdAt: "desc" } } } } } } } });
  if (!access || !isHostTokenActive(access)) return <Unavailable />;
  const { eventHost } = access;
  try { assertHostScope(eventHost, eventHost.group); } catch { return <Unavailable />; }
  await db.hostAccessToken.updateMany({ where: { id: access.id, revokedAt: null }, data: { lastUsedAt: new Date() } });
  const occupied = eventHost.group.registrations.length;
  const remaining = remainingSeats(eventHost.group.capacity, occupied);
  const guests = eventHost.group.registrations.filter((registration) => registration.personId !== eventHost.personId);
  const invitations = eventHost.group.invitations.filter((invitation) => invitation.eventHostId === eventHost.id);
  const query = await searchParams;
  return <>
    <div className="portal-hero"><p className="eyebrow">Host portal</p><h1>Hi, {eventHost.person.firstName}</h1><p>{eventHost.event.name} · {eventHost.group.name}</p></div>
    {query.registered && <div className="success" role="status">Guest added successfully.</div>}
    {query.invited && query.inviteToken && <div className="access-card"><strong>Guest registration link</strong><p>Copy and share this secure link now.</p><a className="portal-link" href={`/invite/${query.inviteToken}`}>{`/invite/${query.inviteToken}`}</a></div>}
    <section className="metrics"><div><strong>{occupied}</strong><span>Group registered</span></div><div><strong>{remaining ?? "—"}</strong><span>Seats remaining</span></div></section>
    {remaining !== null && remaining <= 2 && remaining > 0 && <div className="capacity-warning">Only {remaining} {remaining === 1 ? "seat" : "seats"} left in your group.</div>}{remaining === 0 && <div className="capacity-warning full">Your group is full. Contact event staff if you need another seat.</div>}
    <div className="portal-grid"><section><div className="section-heading"><h2>Your guests</h2><span>{guests.length}</span></div>{guests.length === 0 ? <div className="empty compact"><h3>No registered guests yet</h3><p>Add a guest directly or send an invitation.</p></div> : <div className="registrants">{guests.map(({ id, person }) => <article key={id}><div className="avatar">{person.firstName[0]}{person.lastName[0]}</div><div><strong>{person.firstName} {person.lastName}</strong><p>{person.email ?? person.phone}</p></div><span>Registered</span></article>)}</div>}
      <div className="section-heading invitation-heading"><h2>Invitations</h2><span>{invitations.length}</span></div>{invitations.length > 0 && <div className="invitation-list compact-list">{invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.firstName} {invitation.lastName}</strong><p>{invitation.email ?? invitation.phone}</p></div><span className="invitation-status">{invitationStatusLabel(invitation.status)}</span>{invitationCanManage(invitation.status) && <div className="invitation-actions"><form action={resendHostInvitation}><input type="hidden" name="token" value={token} /><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit">Resend</button></form><form action={cancelHostInvitation}><input type="hidden" name="token" value={token} /><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit">Cancel</button></form></div>}</article>)}</div>}
    </section><section><HostInvitationForm token={token} disabled={remaining === 0} /><details className="walkin-panel host-add-panel"><summary>Add a guest without an invitation</summary><HostGuestForm token={token} disabled={remaining === 0} /></details></section></div>
  </>;
}

function Unavailable() { return <div className="narrow"><div className="empty"><div className="empty-icon">◇</div><h1>This host link is unavailable</h1><p>It may have expired or been replaced. Ask event staff for a new link.</p></div></div>; }
