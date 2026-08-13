import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelInvitation, markInvitationNoResponse, sendInvitation } from "@/app/invitation-actions";
import { InvitationForm } from "@/components/invitation-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitationCanManage, invitationStatusLabel } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ created?: string; sent?: string; token?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { groups: { orderBy: { name: "asc" } }, invitations: { include: { group: true, registration: true }, orderBy: { createdAt: "desc" } } } });
  if (!event) notFound();
  await requireActor(event.organizationId, "invitation:manage", eventId);
  const query = await searchParams;
  const counts = Object.fromEntries(["DRAFT", "SENT", "OPENED", "REGISTERED", "DECLINED", "CANCELLED", "NO_RESPONSE"].map((status) => [status, event.invitations.filter((item) => item.status === status).length]));
  const active = event.invitations.filter((item) => ["SENT", "OPENED"].includes(item.status)).length;
  return <>
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Invitation funnel</p><h1>Invitations</h1><p>Create secure registration links and follow every response.</p></div></div>
    {query.created && <div className="success" role="status">Draft created. Send it when you are ready.</div>}
    {query.sent && query.token && <div className="access-card"><strong>Secure registration link</strong><p>Copy this link now. For security, Gather stores only its digest.</p><a className="portal-link" href={`/invite/${query.token}`}>{`/invite/${query.token}`}</a></div>}
    <section className="metrics invitation-metrics"><div><strong>{event.invitations.length}</strong><span>Total</span></div><div><strong>{active}</strong><span>Awaiting response</span></div><div><strong>{counts.REGISTERED ?? 0}</strong><span>Registered</span></div><div><strong>{counts.DECLINED ?? 0}</strong><span>Declined</span></div></section>
    <div className="invitation-layout"><section><div className="section-heading"><h2>Invitation status</h2><span>{event.invitations.length}</span></div>
      {event.invitations.length === 0 ? <div className="empty compact"><h3>No invitations yet</h3><p>Create the first invitation draft.</p></div> : <div className="invitation-list">{event.invitations.map((invitation) => {
        const actionable = invitationCanManage(invitation.status);
        return <article key={invitation.id}><div><strong>{invitation.firstName} {invitation.lastName}</strong><p>{invitation.email ?? invitation.phone}{invitation.group ? ` · ${invitation.group.name}` : ""}</p><small>{invitation.sentAt ? `Sent ${invitation.sentAt.toLocaleDateString()}` : "Not sent yet"}</small></div><span className={`invitation-status status-${invitation.status.toLowerCase()}`}>{invitationStatusLabel(invitation.status)}</span>{actionable && <div className="invitation-actions"><form action={sendInvitation}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit">{invitation.sentAt ? "Resend" : "Send"}</button></form>{invitation.sentAt && <form action={markInvitationNoResponse}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit">No response</button></form>}<form action={cancelInvitation}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="invitationId" value={invitation.id} /><button type="submit">Cancel</button></form></div>}</article>;
      })}</div>}
    </section><aside><InvitationForm eventId={eventId} groups={event.groups} /></aside></div>
  </>;
}
