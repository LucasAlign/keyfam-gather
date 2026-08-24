import type { Invitation } from "@prisma/client";
import { AuthorizationError, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInvitationToken, invitationCanManage } from "@/lib/invitations";
import { recordInvitationDelivery, type InvitationDeliveryInput } from "@/lib/invitation-delivery";
import { logger, serializeError } from "@/lib/logger";
import { requestOrigin } from "@/lib/request-origin";

// ---------------------------------------------------------------------------
// The single source of truth for invitation lifecycle operations. Both the
// in-app server actions (src/app/invitation-actions.ts) and the Align Core HTTP
// API (src/lib/invitation-service.ts) are thin adapters over these functions —
// they translate I/O (FormData/redirect vs JSON/HTTP status) and nothing more.
// Delivery is emitted from here, so it can never be forgotten on one surface.
// ---------------------------------------------------------------------------

// A transport-neutral domain error carrying an HTTP status and optional field
// errors. The HTTP adapter maps it straight onto a response; the server-action
// adapter surfaces its message. Defined here (not in a route layer) so the core
// owns its own failure vocabulary.
export class InvitationError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: Record<string, string[] | undefined>) {
    super(message);
    this.name = "InvitationError";
  }
}

// requireActor throws AuthorizationError for both unauthenticated and merely
// unauthorized actors; split them so an adapter can return 401 vs 403.
async function authorizeManager(organizationId: string, eventId: string) {
  try {
    return await requireActor(organizationId, "invitation:manage", eventId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new InvitationError(/sign in/i.test(error.message) ? 401 : 403, error.message);
    }
    throw error;
  }
}

async function staffEventScope(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, name: true } });
  if (!event) throw new InvitationError(404, "This event no longer exists.");
  return event;
}

// Delivery is a best-effort side effect recorded after the state transition has
// already committed. A delivery-recording failure must never roll back or block
// the send/resend flow: the sender's copy-paste secure link (the existing
// security model) works regardless of outcome.
export async function deliverInvitationSafely(input: InvitationDeliveryInput) {
  try {
    await recordInvitationDelivery(input);
  } catch (error) {
    logger.error("Invitation delivery recording failed", { ...serializeError(error), invitationId: input.invitationId, eventId: input.eventId });
  }
}

function invitePath(token: string) {
  return `/invite/${token}`;
}

export type SendInvitationResult = { invitation: Invitation; token: string; invitePath: string };

// Staff (re)send: reissue the invitation's token, transition it to SENT, audit
// the change, then deliver. Returns the fresh invitation, the raw one-time
// token, and its invite path so an adapter can build a shareable link.
export async function sendInvitation(eventId: string, invitationId: string): Promise<SendInvitationResult> {
  const event = await staffEventScope(eventId);
  const { user } = await authorizeManager(event.organizationId, eventId);
  const issued = createInvitationToken();

  const invitation = await db.$transaction(async (tx) => {
    const current = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!current) throw new InvitationError(404, "That invitation is not available.");
    if (!invitationCanManage(current.status)) throw new InvitationError(409, "This invitation can no longer be sent.");
    const claimed = await tx.invitation.updateMany({
      where: { id: current.id, status: { in: ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"] } },
      data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null },
    });
    if (claimed.count !== 1) throw new InvitationError(409, "This invitation was changed by another response.");
    const next = await tx.invitation.findUniqueOrThrow({ where: { id: current.id } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: current.sentAt ? "invitation.resent" : "invitation.sent", entityType: "Invitation", entityId: current.id, previousState: JSON.stringify({ status: current.status }), newState: JSON.stringify({ status: next.status, expiresAt: next.expiresAt }) } });
    return next;
  });

  const origin = await requestOrigin();
  await deliverInvitationSafely({
    organizationId: event.organizationId, eventId, invitationId: invitation.id, actorId: user.id,
    firstName: invitation.firstName, email: invitation.email, phone: invitation.phone,
    link: `${origin ?? ""}${invitePath(issued.token)}`, eventName: event.name,
  });

  return { invitation, token: issued.token, invitePath: invitePath(issued.token) };
}
