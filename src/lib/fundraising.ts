import { z } from "zod";

const money = z.coerce.number().finite().positive().multipleOf(0.01);

export const fundraisingGoalSchema = z.object({ goal: money });
export const commitmentSchema = z.object({
  kind: z.enum(["DONATION", "PLEDGE", "SPONSORSHIP", "TICKET"]),
  amount: money,
  description: z.string().trim().max(240).optional().default(""),
  receivedNow: z.coerce.boolean().optional().default(false),
  personId: z.string().optional().default(""),
  groupId: z.string().optional().default(""),
});
export const transactionSchema = z.object({
  commitmentId: z.string().min(1),
  kind: z.enum(["PAYMENT", "REFUND"]),
  amount: money,
  note: z.string().trim().max(240).optional().default(""),
});
export const sponsorshipSchema = z.object({
  sponsorName: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(80),
  amount: money,
  primaryContactPersonId: z.string().optional().default(""),
  groupId: z.string().optional().default(""),
  logoUrl: z.union([z.literal(""), z.string().url()]).optional().default(""),
  guestAllotment: z.coerce.number().int().min(0).max(10000),
  benefits: z.string().trim().max(2000).optional().default(""),
  recognitionNeeds: z.string().trim().max(2000).optional().default(""),
  receivedNow: z.coerce.boolean().optional().default(false),
});
export const sponsorshipFulfillmentSchema = z.object({
  sponsorshipId: z.string().min(1),
  fulfillmentStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BLOCKED"]),
  fulfillmentNotes: z.string().trim().max(2000).optional().default(""),
});

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

export function summarizeFundraising(input: {
  goalCents: number | null;
  commitments: Array<{
    status: "ACTIVE" | "CANCELLED";
    amountCents: number;
    transactions: Array<{ kind: "PAYMENT" | "REFUND"; amountCents: number }>;
  }>;
}) {
  const active = input.commitments.filter((item) => item.status === "ACTIVE");
  const committedCents = active.reduce((sum, item) => sum + item.amountCents, 0);
  const receivedCents = active.reduce((sum, item) => sum + item.transactions.reduce(
    (cash, transaction) => cash + (transaction.kind === "PAYMENT" ? transaction.amountCents : -transaction.amountCents),
    0,
  ), 0);
  return {
    goalCents: input.goalCents,
    committedCents,
    receivedCents,
    outstandingCents: Math.max(committedCents - receivedCents, 0),
    remainingToGoalCents: input.goalCents === null ? null : Math.max(input.goalCents - receivedCents, 0),
  };
}

export function transactionIssue(input: { kind: "PAYMENT" | "REFUND"; amountCents: number; commitmentCents: number; receivedCents: number }) {
  if (input.kind === "PAYMENT" && input.amountCents > input.commitmentCents - input.receivedCents) return "Payment exceeds the outstanding commitment.";
  if (input.kind === "REFUND" && input.amountCents > input.receivedCents) return "Refund exceeds the cash received for this commitment.";
  return null;
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
