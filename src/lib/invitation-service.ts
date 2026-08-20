import { Prisma, type InvitationStatus } from "@prisma/client";
import { z } from "zod";
import { AuthorizationError, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashHostToken, isHostTokenActive } from "@/lib/host-access";
import { createInvitationToken, hashInvitationToken, invitationCanManage, invitationCanRespond, invitationStatusLabel, openedStatus } from "@/lib/invitations";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { withSerializableRetry } from "@/lib/transactions";
import { invitationRegistrationSchema, invitationSchema } from "@/lib/validation";

// ---------------------------------------------------------------------------
// HTTP-shaped error carried out of the service layer. Route handlers map an
// `ApiError` straight onto a JSON response; anything else is a 500.
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: Record<string, string[] | undefined>) {
    super(message);
    this.name = "ApiError";
  }
}

const MANAGEABLE: InvitationStatus[] = ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"];
const RESPONDABLE: InvitationStatus[] = ["SENT", "OPENED"];

// JSON clients send null / omit optional fields; the shared zod schemas were
// written for FormData (empty strings). Normalize before parsing so both work.
function coerceContact(body: unknown): Record<string, unknown> {
  const input = (body ?? {}) as Record<string, unknown>;
  return {
    ...input,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    groupId: input.groupId ?? "",
  };
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(coerceContact(body));
  if (!result.success) {
    throw new ApiError(400, "Review the invitation details.", result.error.flatten().fieldErrors);
  }
  return result.data;
}

function serialize(invitation: {
  id: string; status: InvitationStatus; groupId: string | null; eventId: string;
  firstName: string; lastName: string; sentAt: Date | null; openedAt: Date | null;
  respondedAt: Date | null; expiresAt: Date;
}) {
  return {
    id: invitation.id,
    eventId: invitation.eventId,
    status: invitation.status,
    statusLabel: invitationStatusLabel(invitation.status),
    groupId: invitation.groupId,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    sentAt: invitation.sentAt?.toISOString() ?? null,
    openedAt: invitation.openedAt?.toISOString() ?? null,
    respondedAt: invitation.respondedAt?.toISOString() ?? null,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

async function eventScope(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new ApiError(404, "This event no longer exists.");
  return event;
}

// requireActor throws AuthorizationError for both unauthenticated and
// unauthorized; split them so the API returns 401 vs 403 correctly.
async function actorFor(organizationId: string, eventId: string) {
  try {
    return await requireActor(organizationId, "invitation:manage", eventId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      const status = /sign in/i.test(error.message) ? 401 : 403;
      throw new ApiError(status, error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff surface
// ---------------------------------------------------------------------------

export async function listInvitations(eventId: string, statusFilter?: string) {
  const event = await eventScope(eventId);
  await actorFor(event.organizationId, eventId);
  if (statusFilter && !isInvitationStatus(statusFilter)) {
    throw new ApiError(400, "Invalid status filter.");
  }
  const invitations = await db.invitation.findMany({
    where: { eventId, organizationId: event.organizationId, ...(statusFilter ? { status: statusFilter as InvitationStatus } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return { invitations: invitations.map(serialize) };
}

function isInvitationStatus(value: string): value is InvitationStatus {
  return ["DRAFT", "SENT", "OPENED", "REGISTERED", "DECLINED", "CANCELLED", "NO_RESPONSE"].includes(value);
}

export async function createInvitationDraft(eventId: string, body: unknown) {
  const event = await eventScope(eventId);
  const { user } = await actorFor(event.organizationId, eventId);
  const data = parse(invitationSchema, body);

  const group = data.groupId
    ? await db.group.findFirst({ where: { id: data.groupId, eventId, organizationId: event.organizationId }, select: { id: true } })
    : null;
  if (data.groupId && !group) throw new ApiError(400, "That group is not available for this event.");

  const issued = createInvitationToken();
  const created = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({ data: {
      organizationId: event.organizationId, eventId, senderId: user.id, groupId: group?.id ?? null,
      firstName: data.firstName, lastName: data.lastName,
      email: data.email || null, emailNormalized: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null, phoneNormalized: data.phone ? normalizePhone(data.phone) : null,
      tokenHash: issued.tokenHash, expiresAt: issued.expiresAt,
    } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "invitation.created", entityType: "Invitation", entityId: invitation.id, newState: JSON.stringify({ status: invitation.status, groupId: invitation.groupId }) } });
    return invitation;
  });
  return { invitation: serialize(created) };
}

export async function sendInvitation(eventId: string, invitationId: string) {
  const event = await eventScope(eventId);
  const { user } = await actorFor(event.organizationId, eventId);
  const issued = createInvitationToken();

  const updated = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!invitation) throw new ApiError(404, "That invitation is not available.");
    if (!invitationCanManage(invitation.status)) throw new ApiError(409, "This invitation can no longer be sent.");
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, status: { in: MANAGEABLE } },
      data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null },
    });
    if (claimed.count !== 1) throw new ApiError(409, "This invitation was changed by another response.");
    const next = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: invitation.sentAt ? "invitation.resent" : "invitation.sent", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: next.status, expiresAt: next.expiresAt }) } });
    return next;
  });
  return { invitation: serialize(updated), token: issued.token, invitePath: `/invite/${issued.token}` };
}

async function setStaffStatus(eventId: string, invitationId: string, status: Extract<InvitationStatus, "CANCELLED" | "NO_RESPONSE">) {
  const event = await eventScope(eventId);
  const { user } = await actorFor(event.organizationId, eventId);
  const updated = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!invitation) throw new ApiError(404, "That invitation is not available.");
    if (!invitationCanManage(invitation.status)) throw new ApiError(409, "This invitation can no longer be changed.");
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: MANAGEABLE } }, data: { status, respondedAt: new Date() } });
    if (changed.count !== 1) throw new ApiError(409, "This invitation was changed by another response.");
    const next = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: status === "CANCELLED" ? "invitation.cancelled" : "invitation.no_response", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status }) } });
    return next;
  });
  return { invitation: serialize(updated) };
}

export const cancelInvitation = (eventId: string, invitationId: string) => setStaffStatus(eventId, invitationId, "CANCELLED");
export const markInvitationNoResponse = (eventId: string, invitationId: string) => setStaffStatus(eventId, invitationId, "NO_RESPONSE");

// ---------------------------------------------------------------------------
// Host surface (token-scoped, anonymous)
// ---------------------------------------------------------------------------

async function requireHost(hostToken: string) {
  const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(hostToken) }, include: { eventHost: true } });
  if (!access || !isHostTokenActive(access)) throw new ApiError(403, "This host link is unavailable. Ask event staff for a new link.");
  return access;
}

export async function createHostInvitation(hostToken: string, body: unknown) {
  const access = await requireHost(hostToken);
  const { eventHost } = access;
  const data = parse(invitationSchema, body);
  const issued = createInvitationToken();
  const created = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({ data: {
      organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, groupId: eventHost.groupId,
      firstName: data.firstName, lastName: data.lastName,
      email: data.email || null, emailNormalized: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null, phoneNormalized: data.phone ? normalizePhone(data.phone) : null,
      tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(),
    } });
    await tx.hostAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, action: "invitation.host_sent", entityType: "Invitation", entityId: invitation.id, newState: JSON.stringify({ status: invitation.status, groupId: invitation.groupId }) } });
    return invitation;
  });
  return { invitation: serialize(created), token: issued.token, invitePath: `/invite/${issued.token}` };
}

async function hostInvitation(access: Awaited<ReturnType<typeof requireHost>>, invitationId: string, tx: Prisma.TransactionClient) {
  const invitation = await tx.invitation.findFirst({ where: {
    id: invitationId, eventHostId: access.eventHost.id, eventId: access.eventHost.eventId,
    organizationId: access.eventHost.organizationId, groupId: access.eventHost.groupId,
  } });
  if (!invitation) throw new ApiError(404, "That invitation is not available in your group.");
  return invitation;
}

export async function resendHostInvitation(hostToken: string, invitationId: string) {
  const access = await requireHost(hostToken);
  const issued = createInvitationToken();
  const updated = await db.$transaction(async (tx) => {
    const invitation = await hostInvitation(access, invitationId, tx);
    if (!invitationCanManage(invitation.status)) throw new ApiError(409, "This invitation can no longer be sent.");
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: MANAGEABLE } }, data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null } });
    if (changed.count !== 1) throw new ApiError(409, "This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_resent", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "SENT", expiresAt: issued.expiresAt }) } });
    return tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  });
  return { invitation: serialize(updated), token: issued.token, invitePath: `/invite/${issued.token}` };
}

export async function cancelHostInvitation(hostToken: string, invitationId: string) {
  const access = await requireHost(hostToken);
  const updated = await db.$transaction(async (tx) => {
    const invitation = await hostInvitation(access, invitationId, tx);
    if (!invitationCanManage(invitation.status)) throw new ApiError(409, "This invitation can no longer be cancelled.");
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: MANAGEABLE } }, data: { status: "CANCELLED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new ApiError(409, "This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_cancelled", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "CANCELLED" }) } });
    return tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  });
  return { invitation: serialize(updated) };
}

// ---------------------------------------------------------------------------
// Invitee surface (public token)
// ---------------------------------------------------------------------------

export async function viewInvitation(token: string) {
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { event: { select: { name: true, startsAt: true, venue: true, timezone: true } }, group: { select: { name: true } } } });
  if (!invitation) throw new ApiError(404, "This invitation is unavailable.");

  // Side-effect: viewing a SENT invitation opens it (idempotent — only SENT moves).
  if (invitation.status === "SENT") {
    await db.$transaction(async (tx) => {
      const opened = await tx.invitation.updateMany({ where: { id: invitation.id, status: "SENT" }, data: { status: openedStatus("SENT"), openedAt: new Date() } });
      if (opened.count === 1) {
        await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.opened", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: "SENT" }), newState: JSON.stringify({ status: "OPENED" }) } });
      }
    });
    invitation.status = "OPENED";
  }

  return {
    invitation: serialize(invitation),
    canRespond: invitationCanRespond(invitation.status, invitation.expiresAt),
    event: { name: invitation.event.name, startsAt: invitation.event.startsAt.toISOString(), venue: invitation.event.venue, timezone: invitation.event.timezone },
    group: invitation.group ? { name: invitation.group.name } : null,
  };
}

export async function registerFromInvitation(token: string, body: unknown) {
  const data = parse(invitationRegistrationSchema, body);
  try {
    const result = await withSerializableRetry(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { group: true } });
      if (!invitation) throw new ApiError(404, "This invitation is unavailable.");
      if (!invitationCanRespond(invitation.status, invitation.expiresAt)) throw new ApiError(410, "This invitation is no longer available.");

      if (invitation.group?.capacity != null) {
        const occupied = await tx.registration.count({ where: { organizationId: invitation.organizationId, eventId: invitation.eventId, groupId: invitation.group.id, status: "ACTIVE" } });
        if (occupied >= invitation.group.capacity) throw new ApiError(409, "This group is full. Contact your host or event staff.");
      }

      const emailNormalized = data.email ? normalizeEmail(data.email) : null;
      const phoneNormalized = data.phone ? normalizePhone(data.phone) : null;
      const matches = await tx.person.findMany({ where: { organizationId: invitation.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []),
        ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new ApiError(409, "Your contact details match different records. Ask event staff for help.");

      const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: RESPONDABLE }, expiresAt: { gt: new Date() } }, data: { status: "REGISTERED", respondedAt: new Date() } });
      if (claimed.count !== 1) throw new ApiError(409, "This invitation was already answered.");

      const person = matches[0] ?? await tx.person.create({ data: { organizationId: invitation.organizationId, firstName: data.firstName, lastName: data.lastName, email: data.email || null, emailNormalized, phone: data.phone || null, phoneNormalized } });
      const existing = await tx.registration.findUnique({ where: { eventId_personId: { eventId: invitation.eventId, personId: person.id } } });
      if (existing?.status === "ACTIVE") throw new ApiError(409, "You are already registered for this event.");

      const registration = existing
        ? await tx.registration.update({ where: { id: existing.id }, data: { status: "ACTIVE", cancelledAt: null, groupId: invitation.groupId, tableId: null, partyId: null, source: "INVITATION" } })
        : await tx.registration.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, personId: person.id, groupId: invitation.groupId, source: "INVITATION" } });

      await tx.invitation.update({ where: { id: invitation.id }, data: { inviteeId: person.id, registrationId: existing ? null : registration.id, status: "REGISTERED", respondedAt: new Date(), firstName: data.firstName, lastName: data.lastName, email: data.email || null, emailNormalized, phone: data.phone || null, phoneNormalized } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.registered", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "REGISTERED", registrationId: registration.id, personId: person.id, personReused: Boolean(matches[0]) }) } });
      return { registrationId: registration.id, personId: person.id, groupId: registration.groupId };
    });
    return { registration: result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "You are already registered for this event.");
    throw error;
  }
}

export async function declineInvitation(token: string) {
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) } });
  if (!invitation) throw new ApiError(404, "This invitation is unavailable.");
  if (!invitationCanRespond(invitation.status, invitation.expiresAt)) throw new ApiError(410, "This invitation is no longer available.");
  await db.$transaction(async (tx) => {
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: RESPONDABLE }, expiresAt: { gt: new Date() } }, data: { status: "DECLINED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new ApiError(409, "This invitation was already answered.");
    await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.declined", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "DECLINED" }) } });
  });
  return { invitation: { id: invitation.id, status: "DECLINED" as const } };
}
