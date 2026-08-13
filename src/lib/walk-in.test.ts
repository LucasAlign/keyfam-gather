import { describe, expect, it } from "vitest";
import { walkInMatchIssue } from "./walk-in";

describe("walk-in canonical person matching", () => {
  it("rejects ambiguous identity matches", () => expect(walkInMatchIssue(2, false)).toMatch(/different people/));
  it("routes existing registrations back to check-in", () => expect(walkInMatchIssue(1, true)).toMatch(/already registered/));
  it("allows a new or unregistered canonical person", () => {
    expect(walkInMatchIssue(0, false)).toBeNull();
    expect(walkInMatchIssue(1, false)).toBeNull();
  });
});
