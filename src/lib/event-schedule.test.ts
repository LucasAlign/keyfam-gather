import { describe, expect, it } from "vitest";
import { durationMinutes, formatDuration, scheduleSummary, suggestEndLocal } from "./event-schedule";

describe("suggestEndLocal", () => {
  it("adds the default two-hour window", () => {
    expect(suggestEndLocal("2027-10-10T18:00")).toBe("2027-10-10T20:00");
  });

  it("honors a custom duration", () => {
    expect(suggestEndLocal("2027-10-10T18:00", 3)).toBe("2027-10-10T21:00");
  });

  it("rolls across midnight and the month boundary", () => {
    expect(suggestEndLocal("2027-10-31T23:30", 2)).toBe("2027-11-01T01:30");
  });

  it("returns empty for an unparseable start so the field is left alone", () => {
    expect(suggestEndLocal("")).toBe("");
    expect(suggestEndLocal("not-a-date")).toBe("");
  });
});

describe("durationMinutes", () => {
  it("measures a positive window in whole minutes", () => {
    expect(durationMinutes("2027-10-10T18:00", "2027-10-10T20:30")).toBe(150);
  });

  it("is null when end is not after start", () => {
    expect(durationMinutes("2027-10-10T18:00", "2027-10-10T18:00")).toBeNull();
    expect(durationMinutes("2027-10-10T18:00", "2027-10-10T17:00")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(150)).toBe("2 hr 30 min");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(45)).toBe("45 min");
  });
});

describe("scheduleSummary", () => {
  it("shows a same-day window with a single date and duration", () => {
    expect(scheduleSummary("2027-10-10T18:00", "2027-10-10T20:00")).toBe("Sun, Oct 10, 2027 · 6:00 PM – 8:00 PM · 2 hr");
  });

  it("shows both dates when the window spans days", () => {
    expect(scheduleSummary("2027-10-10T18:00", "2027-10-11T02:00")).toContain("Sun, Oct 10, 2027");
    expect(scheduleSummary("2027-10-10T18:00", "2027-10-11T02:00")).toContain("Mon, Oct 11, 2027");
  });

  it("falls back to just the start when end is missing or invalid", () => {
    expect(scheduleSummary("2027-10-10T18:00", "")).toBe("Sun, Oct 10, 2027 · 6:00 PM");
  });

  it("returns null for an unparseable start", () => {
    expect(scheduleSummary("", "")).toBeNull();
  });
});
