import { describe, expect, it } from "vitest";
import { assertSeatingScope, bulkTableNames, destinationSeatChange, duplicateTableNames, seatingCapacityIssue, tableCapacity } from "./seating";

describe("seating tenant and event isolation", () => {
  const expected = { organizationId: "org-a", eventId: "event-a" };
  it("accepts matching scope", () => expect(() => assertSeatingScope(expected, expected)).not.toThrow());
  it("rejects another tenant", () => expect(() => assertSeatingScope(expected, { organizationId: "org-b", eventId: "event-a" })).toThrow());
  it("rejects another event", () => expect(() => assertSeatingScope(expected, { organizationId: "org-a", eventId: "event-b" })).toThrow());
});

describe("table capacity", () => {
  it("counts only people newly moved to the destination", () => expect(destinationSeatChange(["table-a", null, "table-b"], "table-a")).toBe(2));
  it("blocks over-capacity moves unless explicitly overridden", () => {
    expect(seatingCapacityIssue({ capacity: 8, occupied: 7, addedSeats: 2, overrideCapacity: false })).toMatch(/1 seat over/);
    expect(seatingCapacityIssue({ capacity: 8, occupied: 7, addedSeats: 2, overrideCapacity: true })).toBeNull();
  });
  it("allows the final seat and reports overage separately", () => {
    expect(seatingCapacityIssue({ capacity: 8, occupied: 7, addedSeats: 1, overrideCapacity: false })).toBeNull();
    expect(tableCapacity(8, 10)).toEqual({ remaining: 0, overBy: 2 });
  });
});

describe("bulk Table generation (issue #13)", () => {
  it("expands count, starting number, and pattern into exact names", () => {
    expect(bulkTableNames({ count: 3, startingNumber: 1, namePattern: "Table {n}" })).toEqual(["Table 1", "Table 2", "Table 3"]);
    expect(bulkTableNames({ count: 2, startingNumber: 10, namePattern: "T{n}-A{n}" })).toEqual(["T10-A10", "T11-A11"]);
  });
  it("returns an empty list for a non-positive count", () => {
    expect(bulkTableNames({ count: 0, startingNumber: 1, namePattern: "Table {n}" })).toEqual([]);
    expect(bulkTableNames({ count: Number.NaN, startingNumber: 1, namePattern: "Table {n}" })).toEqual([]);
  });
  it("flags internal duplicates from a pattern without {n}", () => {
    const names = bulkTableNames({ count: 3, startingNumber: 1, namePattern: "Head Table" });
    expect(duplicateTableNames(names)).toEqual(["Head Table"]);
    expect(duplicateTableNames(bulkTableNames({ count: 3, startingNumber: 1, namePattern: "Table {n}" }))).toEqual([]);
  });
});
