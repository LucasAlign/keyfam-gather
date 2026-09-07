import { describe, expect, it } from "vitest";
import { buildHostGroupHealth, type HostGroupInput } from "./host-health";
import { buildHostFollowup, buildHostFollowups, HOST_PORTAL_LINK_PLACEHOLDER, URGENT_WINDOW_DAYS } from "./host-followup";

const health = (overrides: Partial<HostGroupInput> = {}) => buildHostGroupHealth({
  groupId: "g1", groupName: "The Anchors", hostName: "Ada Lovelace",
  capacity: 10, activeRegistrations: 4, missingContactCount: 0, linkStatus: "active", lastActivityAt: new Date(),
  ...overrides,
});

describe("buildHostFollowup", () => {
  it("returns nothing for a healthy Group", () => {
    expect(buildHostFollowup(health({ capacity: 10, activeRegistrations: 10 }), 30)).toBeNull();
  });

  it("carries evidence and an editable draft with the portal-link placeholder", () => {
    const followup = buildHostFollowup(health(), 30);
    expect(followup).not.toBeNull();
    expect(followup!.reasons.some((reason) => /open/.test(reason))).toBe(true);
    expect(followup!.reasons).toContain("30 days until the event.");
    expect(followup!.draftMessage).toContain(HOST_PORTAL_LINK_PLACEHOLDER);
    expect(followup!.draftMessage).toContain("Ada Lovelace");
  });

  it("escalates an attention Group to urgent inside the urgent window", () => {
    const soon = buildHostFollowup(health(), URGENT_WINDOW_DAYS - 1);
    expect(soon!.urgency).toBe("urgent");
    const later = buildHostFollowup(health(), 30);
    expect(later!.urgency).toBe("attention");
  });

  it("flags a missing portal link and adapts the draft wording", () => {
    const followup = buildHostFollowup(health({ linkStatus: "expired" }), 30);
    expect(followup!.urgency).toBe("urgent");
    expect(followup!.needsPortalLink).toBe(true);
    expect(followup!.draftMessage).toContain("refreshed host portal");
  });
});

describe("buildHostFollowups", () => {
  it("skips healthy Groups and ranks urgent, emptiest first", () => {
    const rows = [
      health({ groupId: "full", groupName: "Full", capacity: 8, activeRegistrations: 8 }),
      health({ groupId: "half", groupName: "Half", capacity: 10, activeRegistrations: 5 }),
      health({ groupId: "empty", groupName: "Empty", capacity: 10, activeRegistrations: 1, linkStatus: "none" }),
    ];
    const followups = buildHostFollowups(rows, 30);
    expect(followups.map((f) => f.groupId)).toEqual(["empty", "half"]);
    expect(followups[0].urgency).toBe("urgent");
  });
});
