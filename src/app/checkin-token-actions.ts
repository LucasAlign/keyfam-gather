"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { issueCheckInToken, reissueCheckInToken, revokeCheckInToken } from "@/lib/checkin-token-management";

async function registrationScope(eventId: string, registrationId: string) {
  const registration = await db.registration.findUnique({ where: { id: registrationId }, select: { organizationId: true, eventId: true, status: true } });
  if (!registration || registration.eventId !== eventId || registration.status !== "ACTIVE") return null;
  return registration;
}

export async function issueRegistrationQrCode(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const registration = await registrationScope(eventId, registrationId);
  if (!registration) throw new Error("This registration is not available for this event.");
  const { user } = await requireActor(registration.organizationId, "checkin:manage", eventId);
  const token = await issueCheckInToken({ organizationId: registration.organizationId, eventId, registrationId, actorId: user.id });
  revalidatePath(`/events/${eventId}/registrations/${registrationId}/qr`);
  redirect(`/events/${eventId}/registrations/${registrationId}/qr?token=${encodeURIComponent(token)}`);
}

export async function reissueRegistrationQrCode(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const registration = await registrationScope(eventId, registrationId);
  if (!registration) throw new Error("This registration is not available for this event.");
  const { user } = await requireActor(registration.organizationId, "checkin:manage", eventId);
  const token = await reissueCheckInToken({ organizationId: registration.organizationId, eventId, registrationId, actorId: user.id });
  revalidatePath(`/events/${eventId}/registrations/${registrationId}/qr`);
  redirect(`/events/${eventId}/registrations/${registrationId}/qr?token=${encodeURIComponent(token)}`);
}

export async function revokeRegistrationQrCode(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const registration = await registrationScope(eventId, registrationId);
  if (!registration) throw new Error("This registration is not available for this event.");
  const { user } = await requireActor(registration.organizationId, "checkin:manage", eventId);
  await revokeCheckInToken({ organizationId: registration.organizationId, eventId, registrationId, actorId: user.id });
  revalidatePath(`/events/${eventId}/registrations/${registrationId}/qr`);
}
