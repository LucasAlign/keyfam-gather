import { declineInvitation } from "@/app/invitation-actions";
import { InvitationRegistrationForm } from "@/components/invitation-registration-form";
import { db } from "@/lib/db";
import { hashInvitationToken, invitationCanOpen, invitationCanRespond, openedStatus } from "@/lib/invitations";
import { enforceIpRateLimit } from "@/lib/rate-limit-request";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limit = await enforceIpRateLimit("invite-portal", 60, 60 * 1000);
  if (!limit.allowed) return <div className="narrow"><div className="empty"><div className="empty-icon">◷</div><h1>Please slow down</h1><p>Too many requests from this connection. Try again in about {limit.retryAfterSeconds} seconds.</p></div></div>;
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { event: true, group: true } });
  if (!invitation) return <Unavailable />;
  if (invitation.status === "REGISTERED") return <div className="narrow"><div className="empty"><div className="empty-icon">✓</div><h1>You’re registered</h1><p>We look forward to seeing you at {invitation.event.name}.</p></div></div>;
  if (invitation.status === "DECLINED") return <div className="narrow"><div className="empty"><h1>Response received</h1><p>We let the event team know you cannot attend {invitation.event.name}.</p></div></div>;
  if (!invitationCanOpen(invitation.status, invitation.expiresAt)) return <Unavailable />;
  if (invitation.status === "SENT") {
    await db.$transaction(async (tx) => {
      const openedAt = new Date();
      const result = await tx.invitation.updateMany({
        where: { id: invitation.id, organizationId: invitation.organizationId, eventId: invitation.eventId, status: "SENT" },
        data: { status: openedStatus(invitation.status), openedAt },
      });
      if (result.count === 1) {
        await tx.auditLog.create({ data: {
          organizationId: invitation.organizationId,
          eventId: invitation.eventId,
          action: "invitation.opened",
          entityType: "Invitation",
          entityId: invitation.id,
          previousState: JSON.stringify({ status: "SENT" }),
          newState: JSON.stringify({ status: "OPENED", openedAt }),
        } });
      }
    });
  }
  const canRespond = invitationCanRespond(invitation.status, invitation.expiresAt);
  return <div className="narrow"><div className="portal-hero"><p className="eyebrow">You’re invited</p><h1>{invitation.event.name}</h1><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: invitation.event.timezone }).format(invitation.event.startsAt)}{invitation.event.venue ? ` · ${invitation.event.venue}` : ""}</p>{invitation.group && <p>Hosted with {invitation.group.name}</p>}</div>
    <section><h2>Register for the event</h2><p>Confirm or update your contact details below.</p>{canRespond && <InvitationRegistrationForm token={token} invitation={invitation} />}</section>
    {canRespond && <form action={declineInvitation} className="decline-form"><input type="hidden" name="token" value={token} /><button type="submit">I can’t attend</button></form>}
  </div>;
}

function Unavailable() { return <div className="narrow"><div className="empty"><div className="empty-icon">◇</div><h1>This invitation is unavailable</h1><p>It may have expired, been cancelled, or been replaced. Ask the sender for a new link.</p></div></div>; }
