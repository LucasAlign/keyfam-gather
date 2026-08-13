"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHostToken } from "@/lib/host-access";

export async function revokeHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  await db.$transaction(async (tx) => {
    const access = await tx.hostAccessToken.findFirst({
      where: { id: tokenId, eventHost: { organizationId: event.organizationId, eventId } },
      include: { eventHost: { select: { id: true } } },
    });
    if (!access) throw new Error("That host link is not available for this event.");
    if (access.revokedAt) return;
    const revokedAt = new Date();
    await tx.hostAccessToken.update({ where: { id: access.id }, data: { revokedAt } });
    await tx.auditLog.create({ data: {
      organizationId: event.organizationId,
      eventId,
      actorId: user.id,
      action: "host.access_revoked",
      entityType: "HostAccessToken",
      entityId: access.id,
      previousState: JSON.stringify({ revokedAt: null, expiresAt: access.expiresAt }),
      newState: JSON.stringify({ revokedAt, eventHostId: access.eventHost.id }),
    } });
  });
  revalidatePath(`/events/${eventId}/hosts/new`);
}

export async function rotateHostAccess(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const { user } = await requireActor(event.organizationId, "host:manage", eventId);
  const replacement = createHostToken();
  await db.$transaction(async (tx) => {
    const access = await tx.hostAccessToken.findFirst({
      where: { id: tokenId, eventHost: { organizationId: event.organizationId, eventId } },
      include: { eventHost: { select: { id: true } } },
    });
    if (!access) throw new Error("That host link is not available for this event.");
    const revokedAt = access.revokedAt ?? new Date();
    if (!access.revokedAt) await tx.hostAccessToken.update({ where: { id: access.id }, data: { revokedAt } });
    const created = await tx.hostAccessToken.create({ data: { eventHostId: access.eventHost.id, tokenHash: replacement.tokenHash, expiresAt: replacement.expiresAt } });
    await tx.auditLog.create({ data: {
      organizationId: event.organizationId,
      eventId,
      actorId: user.id,
      action: "host.access_rotated",
      entityType: "HostAccessToken",
      entityId: created.id,
      previousState: JSON.stringify({ tokenId: access.id, revokedAt }),
      newState: JSON.stringify({ tokenId: created.id, eventHostId: access.eventHost.id, expiresAt: replacement.expiresAt }),
    } });
  });
  revalidatePath(`/events/${eventId}/hosts/new`);
  redirect(`/events/${eventId}/hosts/new?access=${encodeURIComponent(replacement.token)}`);
}
