"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { commitmentSchema, fundraisingGoalSchema, sponsorshipFulfillmentSchema, sponsorshipSchema, toCents, transactionIssue, transactionSchema } from "@/lib/fundraising";

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
      if (parsed.data.personId && !await tx.person.findFirst({ where: { id: parsed.data.personId, organizationId: event.organizationId } })) throw new Error("That Person is not available in this organization.");
      if (parsed.data.groupId && !await tx.group.findFirst({ where: { id: parsed.data.groupId, eventId, organizationId: event.organizationId } })) throw new Error("That Group is not available for this event.");
      const commitment = await tx.fundraisingCommitment.create({ data: { organizationId: event.organizationId, eventId, personId: parsed.data.personId || null, groupId: parsed.data.groupId || null, kind: parsed.data.kind, amountCents, description: parsed.data.description || null } });
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

export async function cancelCommitment(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const commitmentId = String(formData.get("commitmentId") ?? "");
  const { event, user } = await editableEvent(eventId);
  await db.$transaction(async (tx) => {
    const commitment = await tx.fundraisingCommitment.findFirst({ where: { id: commitmentId, eventId, organizationId: event.organizationId, status: "ACTIVE" }, include: { transactions: true } });
    if (!commitment) throw new Error("That active commitment is not available for this event.");
    const netReceived = commitment.transactions.reduce((sum, item) => sum + (item.kind === "PAYMENT" ? item.amountCents : -item.amountCents), 0);
    if (netReceived !== 0) throw new Error("Refund received cash before cancelling this commitment.");
    const cancelledAt = new Date();
    await tx.fundraisingCommitment.update({ where: { id: commitment.id }, data: { status: "CANCELLED", cancelledAt } });
    await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "fundraising.commitment_cancelled", entityType: "FundraisingCommitment", entityId: commitment.id, previousState: JSON.stringify({ status: commitment.status }), newState: JSON.stringify({ status: "CANCELLED", cancelledAt }) } });
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/fundraising`);
}

export async function createSponsorship(_: FundraisingActionState, formData: FormData): Promise<FundraisingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = sponsorshipSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the sponsorship details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { event, user } = await editableEvent(eventId);
    await db.$transaction(async (tx) => {
      if (parsed.data.primaryContactPersonId && !await tx.person.findFirst({ where: { id: parsed.data.primaryContactPersonId, organizationId: event.organizationId } })) throw new Error("That primary contact is not available in this organization.");
      if (parsed.data.groupId && !await tx.group.findFirst({ where: { id: parsed.data.groupId, eventId, organizationId: event.organizationId } })) throw new Error("That sponsor Group is not available for this event.");
      const sponsor = await tx.sponsor.create({ data: { organizationId: event.organizationId, eventId, name: parsed.data.sponsorName, primaryContactPersonId: parsed.data.primaryContactPersonId || null, logoUrl: parsed.data.logoUrl || null } });
      const amountCents = toCents(parsed.data.amount);
      const commitment = await tx.fundraisingCommitment.create({ data: { organizationId: event.organizationId, eventId, personId: parsed.data.primaryContactPersonId || null, groupId: parsed.data.groupId || null, kind: "SPONSORSHIP", amountCents, description: `${parsed.data.sponsorName} · ${parsed.data.level}` } });
      if (parsed.data.receivedNow) await tx.financialTransaction.create({ data: { organizationId: event.organizationId, eventId, commitmentId: commitment.id, kind: "PAYMENT", amountCents, note: "Received with sponsorship" } });
      const sponsorship = await tx.sponsorship.create({ data: { organizationId: event.organizationId, eventId, sponsorId: sponsor.id, commitmentId: commitment.id, groupId: parsed.data.groupId || null, level: parsed.data.level, guestAllotment: parsed.data.guestAllotment, benefits: parsed.data.benefits || null, recognitionNeeds: parsed.data.recognitionNeeds || null } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "sponsorship.created", entityType: "Sponsorship", entityId: sponsorship.id, newState: JSON.stringify({ sponsorId: sponsor.id, commitmentId: commitment.id, level: parsed.data.level, guestAllotment: parsed.data.guestAllotment }) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/fundraising`);
    return { success: "Sponsorship recorded." };
  } catch (error) { return { error: error instanceof Error ? error.message : "We couldn't record the sponsorship." }; }
}

export async function updateSponsorshipFulfillment(_: FundraisingActionState, formData: FormData): Promise<FundraisingActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = sponsorshipFulfillmentSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the fulfillment update.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { event, user } = await editableEvent(eventId);
    await db.$transaction(async (tx) => {
      const sponsorship = await tx.sponsorship.findFirst({ where: { id: parsed.data.sponsorshipId, eventId, organizationId: event.organizationId } });
      if (!sponsorship) throw new Error("That sponsorship is not available for this event.");
      await tx.sponsorship.update({ where: { id: sponsorship.id }, data: { fulfillmentStatus: parsed.data.fulfillmentStatus, fulfillmentNotes: parsed.data.fulfillmentNotes || null } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "sponsorship.fulfillment_updated", entityType: "Sponsorship", entityId: sponsorship.id, previousState: JSON.stringify({ fulfillmentStatus: sponsorship.fulfillmentStatus, fulfillmentNotes: sponsorship.fulfillmentNotes }), newState: JSON.stringify(parsed.data) } });
    });
    revalidatePath(`/events/${eventId}/fundraising`);
    return { success: "Sponsor fulfillment updated." };
  } catch (error) { return { error: error instanceof Error ? error.message : "We couldn't update sponsor fulfillment." }; }
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
