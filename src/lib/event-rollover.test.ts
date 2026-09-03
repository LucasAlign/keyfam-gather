import { describe, expect, it } from "vitest";
import {
  buildAudienceRecommendations,
  buildHostRecommendations,
  buildSponsorRecommendations,
  PRESERVED_HISTORY,
  summarizeReusableConfiguration,
} from "./event-rollover";

describe("summarizeReusableConfiguration", () => {
  it("previews exactly what a rollover copies, with counts", () => {
    const preview = summarizeReusableConfiguration({ groups: 3, seatingTables: 12, registrationFields: 2 });
    expect(preview.map((item) => item.label)).toEqual(["Groups", "Seating tables", "Registration fields"]);
    expect(preview[0]).toMatchObject({ count: 3 });
    expect(preview[1].detail).toMatch(/no seats filled/);
  });

  it("says nothing is copied when there is no configuration", () => {
    const preview = summarizeReusableConfiguration({ groups: 0, seatingTables: 0, registrationFields: 0 });
    expect(preview.every((item) => item.count === 0)).toBe(true);
    expect(preview[0].detail).toBe("No groups to copy");
  });

  it("names the participation it deliberately leaves behind", () => {
    expect(PRESERVED_HISTORY.some((line) => /never|not copied|historical|stay/i.test(line))).toBe(true);
  });
});

describe("buildHostRecommendations", () => {
  it("explains evidence and ranks the biggest hosts first", () => {
    const recs = buildHostRecommendations([
      { personId: "p-small", name: "Quiet Host", contact: "quiet@example.com", groupName: "Table 9", guestsBrought: 1, invitationsSent: 2 },
      { personId: "p-big", name: "Anchor Host", contact: "anchor@example.com", groupName: "Table 1", guestsBrought: 10, invitationsSent: 20 },
    ]);
    expect(recs[0].id).toBe("p-big");
    expect(recs[0].reason).toContain("Hosted Table 1");
    expect(recs[0].reason).toContain("brought 10 guests");
    expect(recs[0].reason).toContain("sent 20 invitations");
  });

  it("falls back to a generic reason and singularizes counts", () => {
    const [rec] = buildHostRecommendations([
      { personId: "p", name: "Solo", contact: null, groupName: null, guestsBrought: 1, invitationsSent: 0 },
    ]);
    expect(rec.reason).toBe("Brought 1 guest last year.");
    expect(rec.detail).toBe("No contact on file");
  });
});

describe("buildSponsorRecommendations", () => {
  it("summarizes level, amount, and fulfillment as evidence", () => {
    const [rec] = buildSponsorRecommendations([
      { sponsorId: "s1", name: "Acme", contactName: "Dana", level: "Gold", committedCents: 500000, fullyFulfilled: true, currency: "USD" },
    ]);
    expect(rec.reason).toContain("Gold sponsor");
    expect(rec.reason).toContain("$5,000.00 committed");
    expect(rec.reason).toContain("fully fulfilled");
    expect(rec.detail).toBe("Contact: Dana");
  });

  it("ranks larger commitments first", () => {
    const recs = buildSponsorRecommendations([
      { sponsorId: "small", name: "Bronze Co", contactName: null, level: "Bronze", committedCents: 100000, fullyFulfilled: false, currency: "USD" },
      { sponsorId: "big", name: "Platinum Co", contactName: null, level: "Platinum", committedCents: 900000, fullyFulfilled: false, currency: "USD" },
    ]);
    expect(recs[0].id).toBe("big");
    expect(recs[1].reason).toContain("fulfillment incomplete");
  });
});

describe("buildAudienceRecommendations", () => {
  it("lets the strongest signal set the reason and the ranking", () => {
    const recs = buildAudienceRecommendations([
      { personId: "invited", name: "Invited Only", contact: null, attended: false, registered: false, invited: true },
      { personId: "attended", name: "Attended", contact: "a@example.com", attended: true, registered: true, invited: true },
      { personId: "registered", name: "No Show", contact: null, attended: false, registered: true, invited: true },
    ]);
    expect(recs.map((rec) => rec.id)).toEqual(["attended", "registered", "invited"]);
    expect(recs[0].reason).toBe("Attended last year.");
    expect(recs[1].reason).toMatch(/didn't check in/);
    expect(recs[2].reason).toMatch(/no attendance recorded/);
  });
});
