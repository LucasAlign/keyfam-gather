"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertHostScope, hashHostToken, isHostTokenActive } from "@/lib/host-access";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import { cancelRegistration, reactivateRegistration, updateRegistrationPerson } from "@/lib/registration-lifecycle";
import { registrationUpdateSchema } from "@/lib/validation";

export type RegistrationActionState = { error?: string; success?: string; fields?: Record<string, string[]> };

function values(formData: FormData) { return Object.fromEntries(formData.entries()); }

async function staffContext(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const registrationId = String(formData.get("registrationId") ?? "");
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event || !registrationId) throw new Error("That registration is no longer available.");
  const { user, membership } = await requireActor(event.organizationId, "registration:manage", eventId);
  return { eventId, registrationId, organizationId: event.organizationId, actorId: user.id, restrictSharedPerson: membership.role !== "ORGANIZATION_ADMIN" };
}

async function hostContext(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  await enforcePublicRateLimit("host:registration", token, { limit: 20 });
  const registrationId = String(formData.get("registrationId") ?? "");
  const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(token) }, include: { eventHost: { include: { group: true } } } });
  if (!access || !registrationId || !isHostTokenActive(access)) throw new Error("This host link is no longer valid. Ask event staff for a new link.");
  assertHostScope(access.eventHost, access.eventHost.group);
  await db.hostAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
  return {
    token,
    registrationId,
    organizationId: access.eventHost.organizationId,
    eventId: access.eventHost.eventId,
    eventHostId: access.eventHost.id,
    groupId: access.eventHost.groupId,
    excludedPersonId: access.eventHost.personId,
  };
}

function failure(error: unknown, fallback: string): RegistrationActionState {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "Those contact details already belong to another person." };
  return { error: error instanceof Error ? error.message : fallback };
}

export async function updateStaffRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  const parsed = registrationUpdateSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the guest details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const context = await staffContext(formData);
    await updateRegistrationPerson({ ...context, ...parsed.data });
    revalidatePath(`/events/${context.eventId}`);
    revalidatePath(`/events/${context.eventId}/registrations`);
    return { success: "Registration details updated." };
  } catch (error) { return failure(error, "We couldn't update this registration."); }
}

export async function cancelStaffRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  try {
    const context = await staffContext(formData);
    const result = await cancelRegistration(context);
    revalidatePath(`/events/${context.eventId}`);
    revalidatePath(`/events/${context.eventId}/registrations`);
    revalidatePath(`/events/${context.eventId}/check-in`);
    return { success: result.changed ? "Registration cancelled." : "Registration was already cancelled." };
  } catch (error) { return failure(error, "We couldn't cancel this registration."); }
}

export async function reactivateStaffRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  try {
    const context = await staffContext(formData);
    const result = await reactivateRegistration(context);
    revalidatePath(`/events/${context.eventId}`);
    revalidatePath(`/events/${context.eventId}/registrations`);
    return { success: result.changed ? "Registration restored." : "Registration is already active." };
  } catch (error) { return failure(error, "We couldn't restore this registration."); }
}

export async function updateHostRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  const parsed = registrationUpdateSchema.safeParse(values(formData));
  if (!parsed.success) return { error: "Review the guest details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const context = await hostContext(formData);
    await updateRegistrationPerson({ ...context, ...parsed.data, restrictSharedPerson: true });
    revalidatePath(`/host/${context.token}`);
    return { success: "Guest details updated." };
  } catch (error) { return failure(error, "We couldn't update this guest."); }
}

export async function cancelHostRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  try {
    const context = await hostContext(formData);
    const result = await cancelRegistration(context);
    revalidatePath(`/host/${context.token}`);
    return { success: result.changed ? "Guest registration cancelled." : "Guest registration was already cancelled." };
  } catch (error) { return failure(error, "We couldn't cancel this guest."); }
}

export async function reactivateHostRegistration(_: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  try {
    const context = await hostContext(formData);
    const result = await reactivateRegistration(context);
    revalidatePath(`/host/${context.token}`);
    return { success: result.changed ? "Guest registration restored." : "Guest registration is already active." };
  } catch (error) { return failure(error, "We couldn't restore this guest."); }
}
