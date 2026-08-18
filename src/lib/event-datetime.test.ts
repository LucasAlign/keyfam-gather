import { describe, expect, it } from "vitest";
import { eventInstant, eventLocalDateTime } from "./event-datetime";

describe("event timezone form boundary", () => {
  it("round-trips an event wall time independently of the server timezone", () => {
    const instant = eventInstant("2026-09-01T18:00", "America/New_York");
    expect(instant).toEqual(new Date("2026-09-01T22:00:00.000Z"));
    expect(eventLocalDateTime(instant as Date, "America/New_York")).toBe("2026-09-01T18:00");
  });

  it("rejects a nonexistent daylight-saving wall time", () => expect((eventInstant("2026-03-08T02:30", "America/New_York") as Date).toString()).toBe("Invalid Date"));
});
