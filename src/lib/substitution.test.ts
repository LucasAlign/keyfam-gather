import { describe, expect, it } from "vitest";
import { buildSubstitutionPreview, type SubstitutionOriginal, substitutionBlockedByCapacity } from "./substitution";

const original = (overrides: Partial<SubstitutionOriginal> = {}): SubstitutionOriginal => ({
  personName: "Ada Lovelace",
  groupName: "Table 1 hosts",
  tableName: "Table 1",
  partyName: "The Babbages",
  hasInvitation: true,
  isCheckedIn: false,
  ...overrides,
});

const carryAll = { carryGroup: true, carryTable: true, carryParty: true };

describe("buildSubstitutionPreview", () => {
  it("lists every relationship that will transfer", () => {
    const preview = buildSubstitutionPreview(original(), carryAll, null, false);
    expect(preview.transfers.map((t) => t.label)).toEqual(["Group", "Party", "Table", "Invitation"]);
  });

  it("omits relationships the coordinator chooses not to carry or that are absent", () => {
    const preview = buildSubstitutionPreview(original({ partyName: null, hasInvitation: false }), { carryGroup: true, carryTable: false, carryParty: true }, null, false);
    expect(preview.transfers.map((t) => t.label)).toEqual(["Group"]);
  });

  it("warns when the original guest is checked in", () => {
    const preview = buildSubstitutionPreview(original({ isCheckedIn: true }), carryAll, null, false);
    expect(preview.warnings.some((w) => w.includes("checked in"))).toBe(true);
  });

  it("warns about a full table only when carrying the seat without an override", () => {
    const full = { name: "Table 1", capacity: 8, activeExcludingOriginal: 8 };
    expect(buildSubstitutionPreview(original(), carryAll, full, false).warnings.some((w) => w.includes("at capacity"))).toBe(true);
    expect(buildSubstitutionPreview(original(), carryAll, full, true).warnings.some((w) => w.includes("at capacity"))).toBe(false);
    // Room for one because the original's seat is freed.
    const room = { name: "Table 1", capacity: 8, activeExcludingOriginal: 7 };
    expect(buildSubstitutionPreview(original(), carryAll, room, false).warnings.some((w) => w.includes("at capacity"))).toBe(false);
  });
});

describe("substitutionBlockedByCapacity", () => {
  it("blocks only when carrying a seat that overflows without an override", () => {
    const full = { name: "T", capacity: 8, activeExcludingOriginal: 8 };
    expect(substitutionBlockedByCapacity(carryAll, full, false)).toBe(true);
    expect(substitutionBlockedByCapacity(carryAll, full, true)).toBe(false);
    expect(substitutionBlockedByCapacity({ ...carryAll, carryTable: false }, full, false)).toBe(false);
    expect(substitutionBlockedByCapacity(carryAll, null, false)).toBe(false);
  });
});
