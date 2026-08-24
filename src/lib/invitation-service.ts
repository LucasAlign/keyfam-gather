import type { InvitationStatus } from "@prisma/client";
import { z } from "zod";
import { AuthorizationError, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashInvitationToken, invitationCanRespond, invitationStatusLabel, openedStatus } from "@/lib/invitations";
import {
  InvitationError,
  cancelHostInvitation as coreCancelHostInvitation,
  createHostInvitation as coreCreateHostInvitation,
  createInvitationDraft as coreCreateInvitationDraft,
  declineInvitation as coreDeclineInvitation,
  registerFromInvitation as coreRegisterFromInvitation,
  resendHostInvitation as coreResendHostInvitation,
  sendInvitation as coreSendInvitation,
  setInvitationStaffStatus as coreSetInvitationStaffStatus,
} from "@/lib/invitation-core";
import { invitationRegistrationSchema, invitationSchema } from "@/lib/validation";

// HTTP adapter for the Align Core events module. Every mutating operation
// delegates to invitation-core (the shared source of truth); this layer only
// parses JSON bodies, authorizes reads, and reshapes results into the API
// envelope. ApiError extends the core's InvitationError so a route maps either
// identically; anything else is a 500.
export class ApiError extends InvitationError {}

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

function isInvitationStatus(value: string): value is InvitationStatus {
  return ["DRAFT", "SENT", "OPENED", "REGISTERED", "DECLINED", "CANCELLED", "NO_RESPONSE"].includes(value);
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

export async function createInvitationDraft(eventId: string, body: unknown) {
  const { invitation } = await coreCreateInvitationDraft(eventId, parse(invitationSchema, body));
  return { invitation: serialize(invitation) };
}

export async function sendInvitation(eventId: string, invitationId: string) {
  const result = await coreSendInvitation(eventId, invitationId);
  return { invitation: serialize(result.invitation), token: result.token, invitePath: result.invitePath };
}

export const cancelInvitation = async (eventId: string, invitationId: string) =>
  ({ invitation: serialize((await coreSetInvitationStaffStatus(eventId, invitationId, "CANCELLED")).invitation) });
export const markInvitationNoResponse = async (eventId: string, invitationId: string) =>
  ({ invitation: serialize((await coreSetInvitationStaffStatus(eventId, invitationId, "NO_RESPONSE")).invitation) });

// ---------------------------------------------------------------------------
// Host surface (token-scoped, anonymous)
// ---------------------------------------------------------------------------

export async function createHostInvitation(hostToken: string, body: unknown) {
  const result = await coreCreateHostInvitation(hostToken, parse(invitationSchema, body));
  return { invitation: serialize(result.invitation), token: result.token, invitePath: result.invitePath };
}

export async function resendHostInvitation(hostToken: string, invitationId: string) {
  const result = await coreResendHostInvitation(hostToken, invitationId);
  return { invitation: serialize(result.invitation), token: result.token, invitePath: result.invitePath };
}

export async function cancelHostInvitation(hostToken: string, invitationId: string) {
  const { invitation } = await coreCancelHostInvitation(hostToken, invitationId);
  return { invitation: serialize(invitation) };
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
  const { registrationId, personId, groupId } = await coreRegisterFromInvitation(token, parse(invitationRegistrationSchema, body));
  return { registration: { registrationId, personId, groupId } };
}

export async function declineInvitation(token: string) {
  const { invitationId } = await coreDeclineInvitation(token);
  return { invitation: { id: invitationId, status: "DECLINED" as const } };
}
