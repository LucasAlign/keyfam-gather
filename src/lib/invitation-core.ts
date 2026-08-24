import { Prisma, type Invitation, type InvitationStatus } from "@prisma/client";
import type { z } from "zod";
import { AuthorizationError, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashHostToken, isHostTokenActive } from "@/lib/host-access";
import { createInvitationToken, hashInvitationToken, invitationCanManage, invitationCanRespond } from "@/lib/invitations";
import { recordInvitationDelivery, type InvitationDeliveryInput } from "@/lib/invitation-delivery";
import { logger, serializeError } from "@/lib/logger";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { requestOrigin } from "@/lib/request-origin";
import { withSerializableRetry } from "@/lib/transactions";
import type { invitationRegistrationSchema, invitationSchema } from "@/lib/validation";

export type InvitationInput = z.infer<typeof invitationSchema>;
export type RegistrationInput = z.infer<typeof invitationRegistrationSchema>;

const MANAGEABLE: InvitationStatus[] = ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"];
const RESPONDABLE: InvitationStatus[] = ["SENT", "OPENED"];

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
      where: { id: current.id, status: { in: MANAGEABLE } },
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

// Staff create: a DRAFT invitation. Not delivered — a draft has not been sent.
export async function createInvitationDraft(eventId: string, data: InvitationInput): Promise<{ invitation: Invitation }> {
  const event = await staffEventScope(eventId);
  const { user } = await authorizeManager(event.organizationId, eventId);
  const group = data.groupId
    ? await db.group.findFirst({ where: { id: data.groupId, eventId, organizationId: event.organizationId }, select: { id: true } })
    : null;
  if (data.groupId && !group) throw new InvitationError(400, "That group is not available for this event.");

  const invitation = await db.$transaction(async (tx) => {
    const issued = createInvitationToken();
    const created = await tx.invitation.create({ data: {
      organizationId: event.organizationId, eventId, senderId: user.id, groupId: group?.id ?? null,
      firstName: data.firstName, lastName: data.lastName,
      email: data.email || null, emailNormalized: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null, phoneNormalized: data.phone ? normalizePhone(data.phone) : null,
      tokenHash: issued.tokenHash, expiresAt: issued.expiresAt,
    } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "invitation.created", entityType: "Invitation", entityId: created.id, newState: JSON.stringify({ status: created.status, groupId: created.groupId }) } });
    return created;
  });
  return { invitation };
}

// Staff cancel / mark-no-response: a terminal (CANCELLED) or re-sendable
// (NO_RESPONSE) transition, no delivery.
export async function setInvitationStaffStatus(eventId: string, invitationId: string, status: Extract<InvitationStatus, "CANCELLED" | "NO_RESPONSE">): Promise<{ invitation: Invitation }> {
  const event = await staffEventScope(eventId);
  const { user } = await authorizeManager(event.organizationId, eventId);
  const invitation = await db.$transaction(async (tx) => {
    const current = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!current) throw new InvitationError(404, "That invitation is not available.");
    if (!invitationCanManage(current.status)) throw new InvitationError(409, "This invitation can no longer be changed.");
    const changed = await tx.invitation.updateMany({ where: { id: current.id, status: { in: MANAGEABLE } }, data: { status, respondedAt: new Date() } });
    if (changed.count !== 1) throw new InvitationError(409, "This invitation was changed by another response.");
    const next = await tx.invitation.findUniqueOrThrow({ where: { id: current.id } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: status === "CANCELLED" ? "invitation.cancelled" : "invitation.no_response", entityType: "Invitation", entityId: current.id, previousState: JSON.stringify({ status: current.status }), newState: JSON.stringify({ status }) } });
    return next;
  });
  return { invitation };
}

// ---------------------------------------------------------------------------
// Host surface (token-scoped, anonymous). Host access is loaded with the event
// name so delivery works identically to the staff path.
// ---------------------------------------------------------------------------

async function requireHostAccess(hostToken: string) {
  const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(hostToken) }, include: { eventHost: { include: { event: { select: { name: true } } } } } });
  if (!access || !isHostTokenActive(access)) throw new InvitationError(403, "This host link is unavailable. Ask event staff for a new link.");
  return access;
}

async function scopedHostInvitation(access: Awaited<ReturnType<typeof requireHostAccess>>, invitationId: string, tx: Prisma.TransactionClient) {
  const invitation = await tx.invitation.findFirst({ where: {
    id: invitationId, eventHostId: access.eventHost.id, eventId: access.eventHost.eventId,
    organizationId: access.eventHost.organizationId, groupId: access.eventHost.groupId,
  } });
  if (!invitation) throw new InvitationError(404, "That invitation is not available in your group.");
  return invitation;
}

async function deliverHostInvitation(access: Awaited<ReturnType<typeof requireHostAccess>>, invitation: Invitation, token: string) {
  const origin = await requestOrigin();
  await deliverInvitationSafely({
    organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, invitationId: invitation.id, eventHostId: access.eventHost.id,
    firstName: invitation.firstName, email: invitation.email, phone: invitation.phone,
    link: `${origin ?? ""}${invitePath(token)}`, eventName: access.eventHost.event.name,
  });
}

export async function createHostInvitation(hostToken: string, data: InvitationInput): Promise<SendInvitationResult> {
  const access = await requireHostAccess(hostToken);
  const { eventHost } = access;
  const issued = createInvitationToken();
  const invitation = await db.$transaction(async (tx) => {
    const created = await tx.invitation.create({ data: {
      organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, groupId: eventHost.groupId,
      firstName: data.firstName, lastName: data.lastName,
      email: data.email || null, emailNormalized: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null, phoneNormalized: data.phone ? normalizePhone(data.phone) : null,
      tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(),
    } });
    await tx.hostAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, action: "invitation.host_sent", entityType: "Invitation", entityId: created.id, newState: JSON.stringify({ status: created.status, groupId: created.groupId }) } });
    return created;
  });
  await deliverHostInvitation(access, invitation, issued.token);
  return { invitation, token: issued.token, invitePath: invitePath(issued.token) };
}

export async function resendHostInvitation(hostToken: string, invitationId: string): Promise<SendInvitationResult> {
  const access = await requireHostAccess(hostToken);
  const issued = createInvitationToken();
  const invitation = await db.$transaction(async (tx) => {
    const current = await scopedHostInvitation(access, invitationId, tx);
    if (!invitationCanManage(current.status)) throw new InvitationError(409, "This invitation can no longer be sent.");
    const changed = await tx.invitation.updateMany({ where: { id: current.id, status: { in: MANAGEABLE } }, data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null } });
    if (changed.count !== 1) throw new InvitationError(409, "This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_resent", entityType: "Invitation", entityId: current.id, previousState: JSON.stringify({ status: current.status }), newState: JSON.stringify({ status: "SENT", expiresAt: issued.expiresAt }) } });
    return tx.invitation.findUniqueOrThrow({ where: { id: current.id } });
  });
  await deliverHostInvitation(access, invitation, issued.token);
  return { invitation, token: issued.token, invitePath: invitePath(issued.token) };
}

export async function cancelHostInvitation(hostToken: string, invitationId: string): Promise<{ invitation: Invitation }> {
  const access = await requireHostAccess(hostToken);
  const invitation = await db.$transaction(async (tx) => {
    const current = await scopedHostInvitation(access, invitationId, tx);
    if (!invitationCanManage(current.status)) throw new InvitationError(409, "This invitation can no longer be cancelled.");
    const changed = await tx.invitation.updateMany({ where: { id: current.id, status: { in: MANAGEABLE } }, data: { status: "CANCELLED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new InvitationError(409, "This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_cancelled", entityType: "Invitation", entityId: current.id, previousState: JSON.stringify({ status: current.status }), newState: JSON.stringify({ status: "CANCELLED" }) } });
    return tx.invitation.findUniqueOrThrow({ where: { id: current.id } });
  });
  return { invitation };
}

// ---------------------------------------------------------------------------
// Invitee surface (public token). No actor auth; the opaque token is the grant.
// ---------------------------------------------------------------------------

export type RegisterFromInvitationResult = { eventId: string; registrationId: string; personId: string; groupId: string | null };

export async function registerFromInvitation(token: string, data: RegistrationInput): Promise<RegisterFromInvitationResult> {
  try {
    return await withSerializableRetry(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { group: true } });
      if (!invitation || !invitationCanRespond(invitation.status, invitation.expiresAt)) throw new InvitationError(410, "This invitation is no longer available.");
      if (invitation.group?.capacity != null) {
        const occupied = await tx.registration.count({ where: { organizationId: invitation.organizationId, eventId: invitation.eventId, groupId: invitation.group.id, status: "ACTIVE" } });
        if (occupied >= invitation.group.capacity) throw new InvitationError(409, "This group is full. Contact your host or event staff.");
      }
      const emailNormalized = data.email ? normalizeEmail(data.email) : null;
      const phoneNormalized = data.phone ? normalizePhone(data.phone) : null;
      const matches = await tx.person.findMany({ where: { organizationId: invitation.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new InvitationError(409, "Your contact details match different records. Ask event staff for help.");
      const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: RESPONDABLE }, expiresAt: { gt: new Date() } }, data: { status: "REGISTERED", respondedAt: new Date() } });
      if (claimed.count !== 1) throw new InvitationError(409, "This invitation was already answered.");
      const person = matches[0] ?? await tx.person.create({ data: { organizationId: invitation.organizationId, firstName: data.firstName, lastName: data.lastName, email: data.email || null, emailNormalized, phone: data.phone || null, phoneNormalized } });
      const existing = await tx.registration.findUnique({ where: { eventId_personId: { eventId: invitation.eventId, personId: person.id } } });
      if (existing?.status === "ACTIVE") throw new InvitationError(409, "You are already registered for this event.");
      const registration = existing
        ? await tx.registration.update({ where: { id: existing.id }, data: { status: "ACTIVE", cancelledAt: null, groupId: invitation.groupId, tableId: null, partyId: null, source: "INVITATION" } })
        : await tx.registration.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, personId: person.id, groupId: invitation.groupId, source: "INVITATION" } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { inviteeId: person.id, registrationId: existing ? null : registration.id, status: "REGISTERED", respondedAt: new Date(), firstName: data.firstName, lastName: data.lastName, email: data.email || null, emailNormalized, phone: data.phone || null, phoneNormalized } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.registered", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "REGISTERED", registrationId: registration.id, personId: person.id, personReused: Boolean(matches[0]) }) } });
      return { eventId: invitation.eventId, registrationId: registration.id, personId: person.id, groupId: registration.groupId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new InvitationError(409, "You are already registered for this event.");
    throw error;
  }
}

export async function declineInvitation(token: string): Promise<{ invitationId: string; eventId: string }> {
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) } });
  if (!invitation) throw new InvitationError(404, "This invitation is unavailable.");
  if (!invitationCanRespond(invitation.status, invitation.expiresAt)) throw new InvitationError(410, "This invitation is no longer available.");
  await db.$transaction(async (tx) => {
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: RESPONDABLE }, expiresAt: { gt: new Date() } }, data: { status: "DECLINED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new InvitationError(409, "This invitation was already answered.");
    await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.declined", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "DECLINED" }) } });
  });
  return { invitationId: invitation.id, eventId: invitation.eventId };
}
