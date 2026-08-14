"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { revokeHostAccessCredential, rotateHostAccessCredential } from "@/lib/host-access-management";

export async function revokeHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  await revokeHostAccessCredential({ organizationId: event.organizationId, eventId, actorId: user.id, tokenId });
  revalidatePath(`/events/${eventId}/hosts/new`);
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
