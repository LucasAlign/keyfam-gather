"use server";

import { Prisma, type InvitationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashHostToken, isHostTokenActive } from "@/lib/host-access";
import { createInvitationToken, hashInvitationToken, invitationCanManage, invitationCanRespond } from "@/lib/invitations";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { withSerializableRetry } from "@/lib/transactions";
import { invitationRegistrationSchema, invitationSchema } from "@/lib/validation";

export type InvitationActionState = { error?: string; success?: string; fields?: Record<string, string[]> };

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function rethrowRedirect(error: unknown) {
  if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
}

async function eventScope(eventId: string) {
  return db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
}

export async function createInvitationDraft(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = invitationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the invitation details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await eventScope(eventId);
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "invitation:manage", eventId);
    const group = parsed.data.groupId ? await db.group.findFirst({ where: { id: parsed.data.groupId, eventId, organizationId: event.organizationId }, select: { id: true } }) : null;
    if (parsed.data.groupId && !group) return { error: "That group is not available for this event." };
    const issued = createInvitationToken();
    const invitation = await db.$transaction(async (tx) => {
      const created = await tx.invitation.create({ data: {
        organizationId: event.organizationId, eventId, senderId: user.id, groupId: group?.id ?? null,
        firstName: parsed.data.firstName, lastName: parsed.data.lastName,
        email: parsed.data.email || null, emailNormalized: parsed.data.email ? normalizeEmail(parsed.data.email) : null,
        phone: parsed.data.phone || null, phoneNormalized: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
        tokenHash: issued.tokenHash, expiresAt: issued.expiresAt,
      } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "invitation.created", entityType: "Invitation", entityId: created.id, newState: JSON.stringify({ status: created.status, groupId: created.groupId }) } });
      return created;
    });
    revalidatePath(`/events/${eventId}/invitations`);
    redirect(`/events/${eventId}/invitations?created=${invitation.id}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: error instanceof Error ? error.message : "We couldn't create this invitation." };
  }
}

export async function sendInvitation(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const event = await eventScope(eventId);
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "invitation:manage", eventId);
  const issued = createInvitationToken();
  const changed = await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!invitation || !invitationCanManage(invitation.status)) throw new Error("This invitation can no longer be sent.");
    const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"] } }, data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null } });
    if (claimed.count !== 1) throw new Error("This invitation was changed by another response.");
    const updated = await tx.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: invitation.sentAt ? "invitation.resent" : "invitation.sent", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: updated.status, expiresAt: updated.expiresAt }) } });
    return updated;
  });
  revalidatePath(`/events/${eventId}/invitations`);
  redirect(`/events/${eventId}/invitations?sent=${changed.id}&token=${encodeURIComponent(issued.token)}`);
}

async function setStaffStatus(formData: FormData, status: Extract<InvitationStatus, "CANCELLED" | "NO_RESPONSE">) {
  const eventId = String(formData.get("eventId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const event = await eventScope(eventId);
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "invitation:manage", eventId);
  await db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findFirst({ where: { id: invitationId, eventId, organizationId: event.organizationId } });
    if (!invitation || !invitationCanManage(invitation.status)) throw new Error("This invitation can no longer be changed.");
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"] } }, data: { status, respondedAt: new Date() } });
    if (changed.count !== 1) throw new Error("This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: status === "CANCELLED" ? "invitation.cancelled" : "invitation.no_response", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status }) } });
  });
  revalidatePath(`/events/${eventId}/invitations`);
}

export async function cancelInvitation(formData: FormData) { await setStaffStatus(formData, "CANCELLED"); }
export async function markInvitationNoResponse(formData: FormData) { await setStaffStatus(formData, "NO_RESPONSE"); }

export async function createHostInvitation(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const token = String(formData.get("token") ?? "");
  const parsed = invitationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the invitation details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(token) }, include: { eventHost: true } });
    if (!access || !isHostTokenActive(access)) return { error: "This host link is unavailable. Ask event staff for a new link." };
    const { eventHost } = access;
    const issued = createInvitationToken();
    const invitation = await db.$transaction(async (tx) => {
      const created = await tx.invitation.create({ data: {
        organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, groupId: eventHost.groupId,
        firstName: parsed.data.firstName, lastName: parsed.data.lastName,
        email: parsed.data.email || null, emailNormalized: parsed.data.email ? normalizeEmail(parsed.data.email) : null,
        phone: parsed.data.phone || null, phoneNormalized: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
        tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(),
      } });
      await tx.hostAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, action: "invitation.host_sent", entityType: "Invitation", entityId: created.id, newState: JSON.stringify({ status: created.status, groupId: created.groupId }) } });
      return created;
    });
    revalidatePath(`/host/${token}`);
    redirect(`/host/${token}?invited=${invitation.id}&inviteToken=${encodeURIComponent(issued.token)}`);
  } catch (error) {
    rethrowRedirect(error);
    return { error: error instanceof Error ? error.message : "We couldn't create this invitation." };
  }
}

async function requireHostInvitation(hostToken: string, invitationId: string) {
  const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(hostToken) }, include: { eventHost: true } });
  if (!access || !isHostTokenActive(access)) throw new Error("This host link is unavailable.");
  const invitation = await db.invitation.findFirst({ where: { id: invitationId, eventHostId: access.eventHost.id, eventId: access.eventHost.eventId, organizationId: access.eventHost.organizationId, groupId: access.eventHost.groupId } });
  if (!invitation) throw new Error("That invitation is not available in your group.");
  return { access, invitation };
}

export async function resendHostInvitation(formData: FormData) {
  const hostToken = String(formData.get("token") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const { access, invitation } = await requireHostInvitation(hostToken, invitationId);
  if (!invitationCanManage(invitation.status)) throw new Error("This invitation can no longer be sent.");
  const issued = createInvitationToken();
  await db.$transaction(async (tx) => {
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"] } }, data: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt, status: "SENT", sentAt: new Date(), openedAt: null, respondedAt: null } });
    if (changed.count !== 1) throw new Error("This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_resent", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "SENT", expiresAt: issued.expiresAt }) } });
  });
  revalidatePath(`/host/${hostToken}`);
  redirect(`/host/${hostToken}?invited=${invitation.id}&inviteToken=${encodeURIComponent(issued.token)}`);
}

export async function cancelHostInvitation(formData: FormData) {
  const hostToken = String(formData.get("token") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const { access, invitation } = await requireHostInvitation(hostToken, invitationId);
  if (!invitationCanManage(invitation.status)) throw new Error("This invitation can no longer be cancelled.");
  await db.$transaction(async (tx) => {
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["DRAFT", "SENT", "OPENED", "NO_RESPONSE"] } }, data: { status: "CANCELLED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new Error("This invitation was changed by another response.");
    await tx.auditLog.create({ data: { organizationId: access.eventHost.organizationId, eventId: access.eventHost.eventId, eventHostId: access.eventHost.id, action: "invitation.host_cancelled", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "CANCELLED" }) } });
  });
  revalidatePath(`/host/${hostToken}`);
}

export async function registerFromInvitation(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const token = String(formData.get("token") ?? "");
  const parsed = invitationRegistrationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review your registration details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const result = await withSerializableRetry(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) }, include: { group: true } });
      if (!invitation || !invitationCanRespond(invitation.status, invitation.expiresAt)) throw new Error("This invitation is no longer available.");
      if (invitation.group?.capacity !== null && invitation.group?.capacity !== undefined) {
        const occupied = await tx.registration.count({ where: { organizationId: invitation.organizationId, eventId: invitation.eventId, groupId: invitation.group.id, status: "ACTIVE" } });
        if (occupied >= invitation.group.capacity) throw new Error("This group is full. Contact your host or event staff.");
      }
      const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
      const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
      const matches = await tx.person.findMany({ where: { organizationId: invitation.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new Error("Your contact details match different records. Ask event staff for help.");
      const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["SENT", "OPENED"] }, expiresAt: { gt: new Date() } }, data: { status: "REGISTERED", respondedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("This invitation was already answered.");
      const person = matches[0] ?? await tx.person.create({ data: { organizationId: invitation.organizationId, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized, phone: parsed.data.phone || null, phoneNormalized } });
      const existingRegistration = await tx.registration.findUnique({ where: { eventId_personId: { eventId: invitation.eventId, personId: person.id } } });
      if (existingRegistration?.status === "ACTIVE") throw new Error("You are already registered for this event.");
      const registration = existingRegistration
        ? await tx.registration.update({ where: { id: existingRegistration.id }, data: { status: "ACTIVE", cancelledAt: null, groupId: invitation.groupId, tableId: null, partyId: null, source: "INVITATION" } })
        : await tx.registration.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, personId: person.id, groupId: invitation.groupId, source: "INVITATION" } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { inviteeId: person.id, registrationId: existingRegistration ? null : registration.id, status: "REGISTERED", respondedAt: new Date(), firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized, phone: parsed.data.phone || null, phoneNormalized } });
      await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.registered", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "REGISTERED", registrationId: registration.id, personId: person.id, personReused: Boolean(matches[0]) }) } });
      return { eventId: invitation.eventId };
    });
    revalidatePath(`/events/${result.eventId}`);
    revalidatePath(`/events/${result.eventId}/invitations`);
    redirect(`/invite/${token}?registered=1`);
  } catch (error) {
    rethrowRedirect(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "You are already registered for this event." };
    return { error: error instanceof Error ? error.message : "We couldn't complete your registration." };
  }
}

export async function declineInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashInvitationToken(token) } });
  if (!invitation || !invitationCanRespond(invitation.status, invitation.expiresAt)) redirect(`/invite/${token}?unavailable=1`);
  await db.$transaction(async (tx) => {
    const changed = await tx.invitation.updateMany({ where: { id: invitation.id, status: { in: ["SENT", "OPENED"] }, expiresAt: { gt: new Date() } }, data: { status: "DECLINED", respondedAt: new Date() } });
    if (changed.count !== 1) throw new Error("This invitation was already answered.");
    await tx.auditLog.create({ data: { organizationId: invitation.organizationId, eventId: invitation.eventId, action: "invitation.declined", entityType: "Invitation", entityId: invitation.id, previousState: JSON.stringify({ status: invitation.status }), newState: JSON.stringify({ status: "DECLINED" }) } });
  });
  revalidatePath(`/events/${invitation.eventId}/invitations`);
  redirect(`/invite/${token}?declined=1`);
}
