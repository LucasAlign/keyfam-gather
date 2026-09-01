import { describe, expect, it } from "vitest";
import { eventDuplicateSchema, eventSchema, eventUpdateSchema, registrationSchema, registrationUpdateSchema, walkInSchema } from "./validation";

describe("event validation", () => {
  it("rejects an end before the start", () => expect(eventSchema.safeParse({ name:"Banquet", startsAt:"2026-10-10T19:00", endsAt:"2026-10-10T18:00", timezone:"America/New_York" }).success).toBe(false));
  it("accepts complete configuration and normalizes checkbox state", () => {
    const result = eventUpdateSchema.safeParse({ eventId: "event-1", name: "Banquet", eventType: "Fundraising dinner", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "America/New_York", isPublic: "on", brandingPrimaryColor: "#173a32", contactEmail: "events@example.test", brandingLogoUrl: "https://example.test/logo.png" });
    expect(result.success && result.data.isPublic).toBe(true);
  });
  it("rejects inverted registration windows and invalid branding", () => {
    expect(eventSchema.safeParse({ name: "Banquet", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "America/New_York", registrationOpensAt: "2026-10-02T12:00", registrationClosesAt: "2026-10-01T12:00" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "Banquet", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "America/New_York", brandingPrimaryColor: "red" }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "Banquet", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "Eastern-ish" }).success).toBe(false);
  });
  it("requires new dates while duplicating", () => expect(eventDuplicateSchema.safeParse({ eventId: "event-1", name: "Banquet copy", startsAt: "", endsAt: "" }).success).toBe(false));

  it("preserves event contact fields on create and update (issue #8)", () => {
    const base = { name: "Banquet", eventType: "Fundraising dinner", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "America/New_York", contactName: "Jamie Lee", contactEmail: "jamie@example.test", contactPhone: "212-555-0100" };
    const created = eventSchema.safeParse(base);
    expect(created.success && created.data).toMatchObject({ contactName: "Jamie Lee", contactEmail: "jamie@example.test", contactPhone: "212-555-0100" });
    const updated = eventUpdateSchema.safeParse({ ...base, eventId: "event-1" });
    expect(updated.success && updated.data).toMatchObject({ contactName: "Jamie Lee", contactEmail: "jamie@example.test", contactPhone: "212-555-0100" });
  });

  it("rejects an invalid event contact email with an actionable error", () => {
    const result = eventUpdateSchema.safeParse({ eventId: "event-1", name: "Banquet", startsAt: "2026-10-10T18:00", endsAt: "2026-10-10T21:00", timezone: "America/New_York", contactEmail: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.contactEmail?.[0]).toMatch(/valid contact email/i);
  });
});

describe("walk-in validation", () => {
  it("allows omitted contact and seating details", () => expect(walkInSchema.safeParse({ firstName: "Sam", lastName: "Lee", email: "", phone: "", groupId: "", tableId: "", deviceId: "station-1", overrideCapacity: false }).success).toBe(true));
});

describe("registration validation", () => {
  it("requires one matchable contact", () => expect(registrationSchema.safeParse({ firstName:"A", lastName:"Guest", email:"", phone:"" }).success).toBe(false));
  it("accepts a phone-only registrant", () => expect(registrationSchema.safeParse({ firstName:"A", lastName:"Guest", email:"", phone:"615-555-0100" }).success).toBe(true));
  it("preserves contact validation when adding lifecycle identifiers", () => {
    expect(registrationUpdateSchema.safeParse({ registrationId: "registration-1", firstName: "A", lastName: "Guest", email: "", phone: "" }).success).toBe(false);
    expect(registrationUpdateSchema.safeParse({ registrationId: "registration-1", firstName: "A", lastName: "Guest", email: "a@example.test", phone: "" }).success).toBe(true);
  });
});
