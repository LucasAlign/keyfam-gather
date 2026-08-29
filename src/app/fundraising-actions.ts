"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { commitmentSchema, fundraisingGoalSchema, toCents, transactionIssue, transactionSchema } from "@/lib/fundraising";

export type FundraisingActionState = { error?: string; success?: string; fields?: Record<string, string[]> };

function entries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function editableEvent(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, status: true } });
  if (!event) throw new Error("This event no longer exists.");
  if (event.status === "ARCHIVED") throw new Error("Archived events are read-only.");
  const { user } = await requireActor(event.organizationId, "fundraising:manage", eventId);
  return { event, user };
}

export async function updateFundraisingGoal(_: FundraisingActionState, formData: FormData): Promise<FundraisingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = fundraisingGoalSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Enter a positive fundraising goal.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { event, user } = await editableEvent(eventId);
    const fundraisingGoalCents = toCents(parsed.data.goal);
    await db.$transaction(async (tx) => {
      const previous = await tx.event.findUniqueOrThrow({ where: { id: event.id }, select: { fundraisingGoalCents: true } });
      await tx.event.update({ where: { id: event.id }, data: { fundraisingGoalCents } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "fundraising.goal_updated", entityType: "Event", entityId: eventId, previousState: JSON.stringify(previous), newState: JSON.stringify({ fundraisingGoalCents }) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/fundraising`);
    return { success: "Fundraising goal updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't update the fundraising goal." };
  }
}

export async function createCommitment(_: FundraisingActionState, formData: FormData): Promise<FundraisingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = commitmentSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the commitment details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { event, user } = await editableEvent(eventId);
    const amountCents = toCents(parsed.data.amount);
    await db.$transaction(async (tx) => {
      const commitment = await tx.fundraisingCommitment.create({ data: { organizationId: event.organizationId, eventId, kind: parsed.data.kind, amountCents, description: parsed.data.description || null } });
      if (parsed.data.receivedNow) await tx.financialTransaction.create({ data: { organizationId: event.organizationId, eventId, commitmentId: commitment.id, kind: "PAYMENT", amountCents, note: "Received with commitment" } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "fundraising.commitment_created", entityType: "FundraisingCommitment", entityId: commitment.id, newState: JSON.stringify({ kind: commitment.kind, amountCents, receivedNow: parsed.data.receivedNow }) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/fundraising`);
    return { success: parsed.data.receivedNow ? "Commitment and payment recorded." : "Commitment recorded." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't record the commitment." };
  }
}

export async function recordTransaction(_: FundraisingActionState, formData: FormData): Promise<FundraisingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = transactionSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the transaction details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { event, user } = await editableEvent(eventId);
    const amountCents = toCents(parsed.data.amount);
    await db.$transaction(async (tx) => {
      const commitment = await tx.fundraisingCommitment.findFirst({ where: { id: parsed.data.commitmentId, eventId, organizationId: event.organizationId, status: "ACTIVE" }, include: { transactions: true } });
      if (!commitment) throw new Error("That commitment is not available for this event.");
      const receivedCents = commitment.transactions.reduce((sum, item) => sum + (item.kind === "PAYMENT" ? item.amountCents : -item.amountCents), 0);
      const issue = transactionIssue({ kind: parsed.data.kind, amountCents, commitmentCents: commitment.amountCents, receivedCents });
      if (issue) throw new Error(issue);
      const transaction = await tx.financialTransaction.create({ data: { organizationId: event.organizationId, eventId, commitmentId: commitment.id, kind: parsed.data.kind, amountCents, note: parsed.data.note || null } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: parsed.data.kind === "PAYMENT" ? "fundraising.payment_recorded" : "fundraising.refund_recorded", entityType: "FinancialTransaction", entityId: transaction.id, newState: JSON.stringify({ commitmentId: commitment.id, kind: transaction.kind, amountCents }) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/fundraising`);
    return { success: parsed.data.kind === "PAYMENT" ? "Payment recorded." : "Refund recorded." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't record the transaction." };
  }
}
