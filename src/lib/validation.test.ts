import { describe, expect, it } from "vitest";
import { eventSchema, registrationSchema } from "./validation";

describe("event validation", () => {
  it("rejects an end before the start", () => expect(eventSchema.safeParse({ name:"Banquet", startsAt:"2026-10-10T19:00", endsAt:"2026-10-10T18:00", timezone:"America/New_York" }).success).toBe(false));
});

describe("registration validation", () => {
  it("requires one matchable contact", () => expect(registrationSchema.safeParse({ firstName:"A", lastName:"Guest", email:"", phone:"" }).success).toBe(false));
  it("accepts a phone-only registrant", () => expect(registrationSchema.safeParse({ firstName:"A", lastName:"Guest", email:"", phone:"615-555-0100" }).success).toBe(true));
});
