"use server";

import { EventRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignableEventRoles } from "@/lib/permissions";

export type StaffingActionState = { error?: string; success?: string };

async function authorizeStaffing(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This Event no longer exists.");
  const { user } = await requireActor(event.organizationId, "event:manage", eventId);
  return { organizationId: event.organizationId, actorId: user.id };
}

// Assign (or change) a user's event-night role. Coordinators only; audited.
export async function assignEventRole(_: StaffingActionState, formData: FormData): Promise<StaffingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as EventRole;
  if (!assignableEventRoles.includes(role)) return { error: "Choose a valid event role." };
  try {
    const { organizationId, actorId } = await authorizeStaffing(eventId);
    const membership = await db.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } }, select: { id: true } });
    if (!membership) return { error: "That person is not a member of this organization." };
    const assignment = await db.eventAssignment.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId, organizationId, role },
      update: { role },
    });
    await db.auditLog.create({ data: { organizationId, eventId, actorId, action: "event.role_assigned", entityType: "EventAssignment", entityId: assignment.id, newState: JSON.stringify({ userId, role }) } });
    revalidatePath(`/events/${eventId}/staffing`);
    return { success: "Role updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't update this role." };
  }
}

// Remove a user's event assignment entirely.
export async function revokeEventRole(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const { organizationId, actorId } = await authorizeStaffing(eventId);
  const existing = await db.eventAssignment.findUnique({ where: { userId_eventId: { userId, eventId } }, select: { id: true, role: true } });
  if (!existing) return;
  await db.eventAssignment.delete({ where: { id: existing.id } });
  await db.auditLog.create({ data: { organizationId, eventId, actorId, action: "event.role_revoked", entityType: "EventAssignment", entityId: existing.id, previousState: JSON.stringify({ userId, role: existing.role }) } });
  revalidatePath(`/events/${eventId}/staffing`);
}
