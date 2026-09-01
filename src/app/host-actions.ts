"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { issueAdditionalHostAccessCredential, recoverHostAccessToken, resendHostAccessLink, revokeHostAccessCredential, rotateHostAccessCredential } from "@/lib/host-access-management";
import { requestOrigin } from "@/lib/request-origin";

export type HostAccessActionState = { error?: string; success?: string; path?: string };

async function authorizeHostEvent(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  return { organizationId: event.organizationId, actorId: user.id };
}

export async function issueAdditionalHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const eventHostId = String(formData.get("eventHostId") ?? "");
  const { organizationId, actorId } = await authorizeHostEvent(eventId);
  const credential = await issueAdditionalHostAccessCredential({ organizationId, eventId, eventHostId, actorId });
  revalidatePath(`/events/${eventId}/hosts/new`);
  redirect(`/events/${eventId}/hosts/new?access=${encodeURIComponent(credential)}`);
}

export async function revokeHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  await revokeHostAccessCredential({ organizationId: event.organizationId, eventId, actorId: user.id, tokenId });
  revalidatePath(`/events/${eventId}/hosts/new`);
}

export async function recoverHostAccess(_: HostAccessActionState, formData: FormData): Promise<HostAccessActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  try {
    const { organizationId, actorId } = await authorizeHostEvent(eventId);
    const { token } = await recoverHostAccessToken({ organizationId, eventId, actorId, tokenId });
    return { path: `/host/${token}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't recover this host link." };
  }
}

export async function resendHostAccess(_: HostAccessActionState, formData: FormData): Promise<HostAccessActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  try {
    const { organizationId, actorId } = await authorizeHostEvent(eventId);
    const origin = await requestOrigin();
    const { recipientMasked } = await resendHostAccessLink({ organizationId, eventId, actorId, tokenId, origin });
    return { success: `Sent the host link to ${recipientMasked}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't resend this host link." };
  }
}

export async function rotateHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  const replacement = await rotateHostAccessCredential({ organizationId: event.organizationId, eventId, actorId: user.id, tokenId });
  revalidatePath(`/events/${eventId}/hosts/new`);
  redirect(`/events/${eventId}/hosts/new?access=${encodeURIComponent(replacement)}`);
}
