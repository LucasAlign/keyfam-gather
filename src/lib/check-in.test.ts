import { describe, expect, it } from "vitest";
import { canUndoCheckIn, matchesCheckInSearch, normalizeCheckInSearch } from "./check-in";

describe("check-in search", () => {
  it("normalizes case, accents, phone punctuation, and whitespace", () => expect(normalizeCheckInSearch("  Jos\u00e9 (212) 555-0100 ")).toBe("jose 212 555 0100"));
  it("matches every query term across the searchable registration text", () => {
    const text = "Jos\u00e9 Alvarez jose@example.org (212) 555-0100 Rivera Group Table 8 Family Party";
    expect(matchesCheckInSearch(text, "alvarez table 8")).toBe(true);
    expect(matchesCheckInSearch(text, "alvarez table 9")).toBe(false);
  });
});

describe("check-in undo", () => {
  const checkedInAt = new Date("2026-08-12T20:00:00Z");
  it("allows an active recent check-in", () => expect(canUndoCheckIn(checkedInAt, null, new Date("2026-08-12T20:14:59Z"))).toBe(true));
  it("rejects expired or already reversed check-ins", () => {
    expect(canUndoCheckIn(checkedInAt, null, new Date("2026-08-12T20:16:00Z"))).toBe(false);
    expect(canUndoCheckIn(checkedInAt, new Date("2026-08-12T20:01:00Z"), new Date("2026-08-12T20:02:00Z"))).toBe(false);
  });
});
