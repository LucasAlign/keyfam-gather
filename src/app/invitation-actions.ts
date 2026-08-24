"use server";

import type { InvitationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  InvitationError,
  cancelHostInvitation as cancelHostInvitationCore,
  createHostInvitation as createHostInvitationCore,
  createInvitationDraft as createInvitationDraftCore,
  declineInvitation as declineInvitationCore,
  registerFromInvitation as registerFromInvitationCore,
  resendHostInvitation as resendHostInvitationCore,
  sendInvitation as sendInvitationCore,
  setInvitationStaffStatus as setInvitationStaffStatusCore,
} from "@/lib/invitation-core";
import { enforceIpRateLimit } from "@/lib/rate-limit-request";
import { invitationRegistrationSchema, invitationSchema } from "@/lib/validation";

// Thin "use server" adapter over invitation-core: parse FormData, then map the
// core result to a revalidate + redirect, or a core InvitationError to form
// state. All business logic (transactions, guards, audit, delivery) lives in
// the core, shared with the Align Core HTTP API in src/lib/invitation-service.ts.

export type InvitationActionState = { error?: string; success?: string; fields?: Record<string, string[]> };

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function rethrowRedirect(error: unknown) {
  if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
}

function stateFromError(error: unknown, fallback: string): InvitationActionState {
  rethrowRedirect(error);
  return { error: error instanceof Error ? error.message : fallback };
}

export async function createInvitationDraft(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = invitationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the invitation details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { invitation } = await createInvitationDraftCore(eventId, parsed.data);
    revalidatePath(`/events/${eventId}/invitations`);
    redirect(`/events/${eventId}/invitations?created=${invitation.id}`);
  } catch (error) {
    return stateFromError(error, "We couldn't create this invitation.");
  }
}

export async function sendInvitation(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const { invitation, token } = await sendInvitationCore(eventId, invitationId);
  revalidatePath(`/events/${eventId}/invitations`);
  redirect(`/events/${eventId}/invitations?sent=${invitation.id}&token=${encodeURIComponent(token)}`);
}

async function setStaffStatus(formData: FormData, status: Extract<InvitationStatus, "CANCELLED" | "NO_RESPONSE">) {
  const eventId = String(formData.get("eventId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  await setInvitationStaffStatusCore(eventId, invitationId, status);
  revalidatePath(`/events/${eventId}/invitations`);
}

export async function cancelInvitation(formData: FormData) { await setStaffStatus(formData, "CANCELLED"); }
export async function markInvitationNoResponse(formData: FormData) { await setStaffStatus(formData, "NO_RESPONSE"); }

export async function createHostInvitation(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const hostToken = String(formData.get("token") ?? "");
  const parsed = invitationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the invitation details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { invitation, token } = await createHostInvitationCore(hostToken, parsed.data);
    revalidatePath(`/host/${hostToken}`);
    redirect(`/host/${hostToken}?invited=${invitation.id}&inviteToken=${encodeURIComponent(token)}`);
  } catch (error) {
    return stateFromError(error, "We couldn't create this invitation.");
  }
}

export async function resendHostInvitation(formData: FormData) {
  const hostToken = String(formData.get("token") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const { invitation, token } = await resendHostInvitationCore(hostToken, invitationId);
  revalidatePath(`/host/${hostToken}`);
  redirect(`/host/${hostToken}?invited=${invitation.id}&inviteToken=${encodeURIComponent(token)}`);
}

export async function cancelHostInvitation(formData: FormData) {
  const hostToken = String(formData.get("token") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  await cancelHostInvitationCore(hostToken, invitationId);
  revalidatePath(`/host/${hostToken}`);
}

export async function registerFromInvitation(_: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const token = String(formData.get("token") ?? "");
  const limit = await enforceIpRateLimit("invitation-register", 20, 5 * 60 * 1000);
  if (!limit.allowed) return { error: `Too many attempts. Please try again in ${limit.retryAfterSeconds} seconds.` };
  const parsed = invitationRegistrationSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review your registration details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { eventId } = await registerFromInvitationCore(token, parsed.data);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/invitations`);
    redirect(`/invite/${token}?registered=1`);
  } catch (error) {
    return stateFromError(error, "We couldn't complete your registration.");
  }
}

export async function declineInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  let result: Awaited<ReturnType<typeof declineInvitationCore>>;
  try {
    result = await declineInvitationCore(token);
  } catch (error) {
    rethrowRedirect(error);
    // Missing / no-longer-respondable invitations redirect to a neutral notice
    // rather than surfacing an error, matching the prior invitee experience.
    if (error instanceof InvitationError && (error.status === 404 || error.status === 410)) redirect(`/invite/${token}?unavailable=1`);
    throw error;
  }
  revalidatePath(`/events/${result.eventId}/invitations`);
  redirect(`/invite/${token}?declined=1`);
}
