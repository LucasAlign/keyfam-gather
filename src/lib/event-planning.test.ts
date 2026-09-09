import { describe, expect, it } from "vitest";
import { budgetTotals, moneyCents, optionalMoneyCents, quickLinkSchema } from "./event-planning";

describe("event planning", () => {
  it("calculates forecasts without double counting estimates and respects zero actual costs", () => {
    expect(budgetTotals([{ plannedCents: 10000, actualCents: 12000 }, { plannedCents: 5000, actualCents: null }, { plannedCents: 3000, actualCents: 0 }])).toEqual({ planned: 18000, actual: 12000, forecast: 17000 });
    expect(budgetTotals([])).toEqual({ planned: 0, actual: 0, forecast: 0 });
  });
  it("stores exact cents and distinguishes blank from zero", () => {
    expect(moneyCents.parse("1.01")).toBe(101);
    expect(optionalMoneyCents.parse("")).toBeUndefined();
    expect(optionalMoneyCents.parse("0")).toBe(0);
    for (const value of ["-1", "1.001", "Infinity", "1e3", "21474836.48"]) expect(moneyCents.safeParse(value).success).toBe(false);
  });
  it("accepts Google document and folder links and rejects unsafe or lookalike URLs", () => {
    for (const url of ["https://drive.google.com/drive/folders/abc", "https://docs.google.com/spreadsheets/d/abc/edit"]) expect(quickLinkSchema.safeParse({ title: "Plan", url }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "http://drive.google.com/a", "https://drive.google.com.evil.com/a", "https://drive.google.com@evil.com/a", "https://user:pass@docs.google.com/a"]) expect(quickLinkSchema.safeParse({ title: "Plan", url }).success).toBe(false);
  });
});
