import { describe, expect, it } from "vitest";
import { commitmentSchema, summarizeFundraising, toCents, transactionIssue } from "./fundraising";

describe("fundraising module interface", () => {
  it("never treats a pledge as received cash", () => {
    expect(summarizeFundraising({
      goalCents: 100_000,
      commitments: [{ status: "ACTIVE", amountCents: 40_000, transactions: [] }],
    })).toEqual({ goalCents: 100_000, committedCents: 40_000, receivedCents: 0, outstandingCents: 40_000, remainingToGoalCents: 100_000 });
  });

  it("subtracts refunds from received cash without reducing the commitment", () => {
    expect(summarizeFundraising({
      goalCents: 100_000,
      commitments: [{ status: "ACTIVE", amountCents: 40_000, transactions: [{ kind: "PAYMENT", amountCents: 25_000 }, { kind: "REFUND", amountCents: 5_000 }] }],
    })).toEqual({ goalCents: 100_000, committedCents: 40_000, receivedCents: 20_000, outstandingCents: 20_000, remainingToGoalCents: 80_000 });
  });

  it("excludes cancelled commitments and their transactions", () => {
    expect(summarizeFundraising({
      goalCents: null,
      commitments: [{ status: "CANCELLED", amountCents: 50_000, transactions: [{ kind: "PAYMENT", amountCents: 50_000 }] }],
    }).receivedCents).toBe(0);
  });

  it("accepts cents-safe money and rejects fractions of a cent", () => {
    expect(toCents(commitmentSchema.parse({ kind: "PLEDGE", amount: "123.45" }).amount)).toBe(12_345);
    expect(commitmentSchema.safeParse({ kind: "PLEDGE", amount: "1.001" }).success).toBe(false);
  });

  it("prevents overpayment and refunding cash that was not received", () => {
    expect(transactionIssue({ kind: "PAYMENT", amountCents: 30_001, commitmentCents: 50_000, receivedCents: 20_000 })).toMatch(/outstanding/);
    expect(transactionIssue({ kind: "REFUND", amountCents: 20_001, commitmentCents: 50_000, receivedCents: 20_000 })).toMatch(/cash received/);
    expect(transactionIssue({ kind: "PAYMENT", amountCents: 30_000, commitmentCents: 50_000, receivedCents: 20_000 })).toBeNull();
  });
});
