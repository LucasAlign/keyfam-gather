import { EventStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertEventTransition, nextEventStatus } from "./event-configuration";

describe("event lifecycle", () => {
  it("advances through each operational stage", () => {
    expect(nextEventStatus(EventStatus.DRAFT)).toBe(EventStatus.REGISTRATION_OPEN);
    expect(nextEventStatus(EventStatus.REGISTRATION_CLOSED)).toBe(EventStatus.EVENT_LIVE);
    expect(nextEventStatus(EventStatus.COMPLETED)).toBe(EventStatus.ARCHIVED);
    expect(nextEventStatus(EventStatus.ARCHIVED)).toBeNull();
  });

  it("rejects skipped and backward transitions", () => {
    expect(() => assertEventTransition(EventStatus.DRAFT, EventStatus.EVENT_LIVE)).toThrow(/cannot move/i);
    expect(() => assertEventTransition(EventStatus.EVENT_LIVE, EventStatus.REGISTRATION_CLOSED)).toThrow(/cannot move/i);
  });
});
