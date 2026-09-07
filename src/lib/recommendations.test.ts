import { describe, expect, it } from "vitest";
import { prepareRecommendation, visibleRecommendation } from "./recommendations";

const proposal = { kind: "EVENT_CONTACT", dedupeKey: "event-contact", title: "Add an Event contact", why: "Guests need help.", evidence: { phone: false, email: false }, proposedAction: { type: "REVIEW_WORKSPACE" as const, href: "/events/e1/settings", label: "Review settings" }, expectedImpact: "Guests know whom to contact.", confidence: 1 };

describe("recommendation contract", () => {
  it("fingerprints evidence deterministically", () => {
    expect(prepareRecommendation(proposal).sourceFingerprint).toBe(prepareRecommendation({ ...proposal, evidence: { email: false, phone: false } }).sourceFingerprint);
  });
  it("changes the fingerprint when source facts change", () => expect(prepareRecommendation(proposal).sourceFingerprint).not.toBe(prepareRecommendation({ ...proposal, evidence: { phone: true, email: false } }).sourceFingerprint));
  it("only resurfaces a snooze after its due time", () => {
    expect(visibleRecommendation("SNOOZED", new Date("2026-09-08"), new Date("2026-09-07"))).toBe(false);
    expect(visibleRecommendation("SNOOZED", new Date("2026-09-06"), new Date("2026-09-07"))).toBe(true);
  });
});
