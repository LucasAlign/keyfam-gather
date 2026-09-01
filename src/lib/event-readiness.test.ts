import { describe, expect, it } from "vitest";
import { eventReadiness, friendlyEventStatus, lifecycleConsequences } from "./event-readiness";

describe("event readiness", () => {
  it("derives progress from Event data rather than stored checkboxes", () => {
    const items = eventReadiness({ id: "event-1", contactEmail: null, contactPhone: "555", fundraisingGoalCents: 100, isPublic: false, tableCount: 0, registrationCount: 1, hostCount: 0, sponsorshipCount: 0, checkInReady: false });
    expect(items.find((item) => item.id === "contact")?.complete).toBe(true);
    expect(items.find((item) => item.id === "registration")?.complete).toBe(true);
    expect(items.find((item) => item.id === "tables")?.complete).toBe(false);
  });
  it("formats lifecycle codes for customers", () => expect(friendlyEventStatus("REGISTRATION_OPEN")).toBe("Registration open"));
  it("explains the read-only archive consequence", () => expect(lifecycleConsequences("ARCHIVED").join(" ")).toMatch(/read-only/));
});
