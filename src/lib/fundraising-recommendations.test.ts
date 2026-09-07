import { describe, expect, it } from "vitest";
import { detectFundraisingRecommendations, detectSponsorshipRecommendations, fundraisingForecast } from "./fundraising-recommendations";

describe("fundraising recommendations", () => {
  it("separates financial states and exposes projection uncertainty", () => expect(fundraisingForecast(20_000, [{ id: "p1", label: "Pledge", kind: "PLEDGE", amountCents: 10_000, receivedCents: 2_000 }, { id: "d1", label: "Gift", kind: "DONATION", amountCents: 5_000, receivedCents: -1_000 }])).toEqual({ goalCents: 20_000, committedCents: 15_000, receivedCents: 1_000, refundedCents: 1_000, outstandingCents: 13_000, projectedCents: 13_000, remainingToGoalCents: 19_000, projectedGapCents: 7_000 }));
  it("names commitments that explain a forecast gap", () => expect(detectFundraisingRecommendations("e1", 20_000, [{ id: "p1", label: "Jordan pledge", kind: "PLEDGE", amountCents: 10_000, receivedCents: 0 }])[0].evidence.contributingRecords).toContain("Jordan pledge"));
  it("lists every missing sponsor input", () => {
    const item = detectSponsorshipRecommendations("e1", [{ id: "s1", sponsorName: "Acme", guestAllotment: 8, registeredGuests: 5, hasLogo: false, hasBenefits: true, hasRecognition: false, commitmentCents: 100_000, receivedCents: 50_000, fulfillmentStatus: "IN_PROGRESS" }])[0];
    expect(item.evidence.missingItems).toContain("3 guest name(s)");
    expect(item.evidence.missingItems).toContain("logo");
    expect(item.evidence.missingItems).toContain("recognition details");
    expect(item.evidence.missingItems).toContain("50000 cents payment");
  });
});
