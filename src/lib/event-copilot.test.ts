import { describe, expect, it } from "vitest";
import { detectReadinessRecommendations } from "./event-copilot";

describe("Event Copilot readiness detector", () => {
  it("keeps readiness separate from lifecycle and explains each action", () => {
    const recommendations = detectReadinessRecommendations({ eventId: "event-1", contactEmail: null, contactPhone: null, isPublic: false, tableCount: 0, registrationCount: 3, unassignedCount: 2 });
    expect(recommendations.map(({ kind }) => kind)).toEqual(["EVENT_CONTACT", "REGISTRATION_SHARING", "SEATING_SETUP", "UNASSIGNED_GUESTS"]);
    expect(recommendations.every((item) => item.why && item.expectedImpact && Object.keys(item.evidence).length > 0)).toBe(true);
  });
  it("removes resolved operational signals", () => expect(detectReadinessRecommendations({ eventId: "event-1", contactEmail: "help@example.org", contactPhone: null, isPublic: true, tableCount: 20, registrationCount: 100, unassignedCount: 0 })).toEqual([]));
});
