"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenseSchema, optionalMoneyCents, quickLinkSchema } from "@/lib/event-planning";
import { withSerializableRetry } from "@/lib/transactions";

export type PlanningState = { error?: string; success?: string };

export async function saveEventPlanning(_: PlanningState, form: FormData): Promise<PlanningState> {
  const eventId = String(form.get("eventId") ?? "");
  const operation = String(form.get("operation") ?? "");
  const id = String(form.get("id") ?? "");
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
    const { user } = await requireActor(event.organizationId, "event:manage", eventId);
    await withSerializableRetry(async (tx) => {
      const current = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      if (current.status === "ARCHIVED") throw new Error("Archived events are read-only.");
      let previous: unknown = null;
      let saved: unknown;
      if (operation === "budget") {
        const budgetCents = optionalMoneyCents.parse(form.get("budgetCents")) ?? null;
        previous = { budgetCents: current.budgetCents };
        saved = await tx.event.update({ where: { id: eventId }, data: { budgetCents }, select: { budgetCents: true } });
      } else if (operation === "expense" || operation === "removeExpense") {
        if (id) {
          previous = await tx.eventExpense.findFirst({ where: { id, eventId } });
          if (!previous) throw new Error("This cost is no longer available for this event.");
        }
        if (operation === "removeExpense") {
          if (!id) throw new Error("Choose a cost to remove.");
          saved = await tx.eventExpense.delete({ where: { id, eventId } });
        } else {
          const parsed = expenseSchema.parse(Object.fromEntries(form));
          const data = { ...parsed, actualCents: parsed.actualCents ?? null };
          saved = id ? await tx.eventExpense.update({ where: { id, eventId }, data }) : await tx.eventExpense.create({ data: { eventId, ...data } });
        }
      } else if (operation === "link" || operation === "removeLink") {
        if (id) {
          previous = await tx.eventQuickLink.findFirst({ where: { id, eventId } });
          if (!previous) throw new Error("This link is no longer available for this event.");
        }
        if (operation === "removeLink") {
          if (!id) throw new Error("Choose a link to remove.");
          saved = await tx.eventQuickLink.delete({ where: { id, eventId } });
        } else {
          const data = quickLinkSchema.parse(Object.fromEntries(form));
          saved = id ? await tx.eventQuickLink.update({ where: { id, eventId }, data }) : await tx.eventQuickLink.create({ data: { eventId, ...data } });
        }
      } else throw new Error("Choose a valid planning action.");
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: `event.planning.${operation}`, entityType: "Event", entityId: eventId, previousState: JSON.stringify(previous), newState: JSON.stringify(saved) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/planning`);
    return { success: "Saved." };
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return { error: "Review the details. Amounts must be non-negative with up to two decimal places; document links must use https://drive.google.com or https://docs.google.com." };
    return { error: error instanceof Error ? error.message : "Unable to save changes." };
  }
}
