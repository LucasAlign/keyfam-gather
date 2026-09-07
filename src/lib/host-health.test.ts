import { describe, expect, it } from "vitest";
import { buildHostGroupHealth, type HostGroupInput, sortByFollowUp, summarizeHostHealth } from "./host-health";

const base = (overrides: Partial<HostGroupInput> = {}): HostGroupInput => ({
  groupId: "g1",
  groupName: "Table 1 hosts",
  hostName: "Ada Lovelace",
  capacity: 10,
  activeRegistrations: 10,
  missingContactCount: 0,
  linkStatus: "active",
  lastActivityAt: new Date("2026-09-01T00:00:00Z"),
  ...overrides,
});

describe("buildHostGroupHealth", () => {
  it("marks a full, active, used group as OK", () => {
    const health = buildHostGroupHealth(base());
    expect(health.remaining).toBe(0);
    expect(health.followUp.level).toBe("ok");
    expect(health.followUp.reasons).toEqual([]);
  });

  it("treats a missing or dead portal link as urgent", () => {
    expect(buildHostGroupHealth(base({ linkStatus: "none" })).followUp.level).toBe("urgent");
    expect(buildHostGroupHealth(base({ linkStatus: "expired" })).followUp.level).toBe("urgent");
    expect(buildHostGroupHealth(base({ linkStatus: "revoked" })).followUp.level).toBe("urgent");
  });

  it("flags underfilled groups, missing contacts, and never-opened portals as attention", () => {
    const underfilled = buildHostGroupHealth(base({ activeRegistrations: 6 }));
    expect(underfilled.remaining).toBe(4);
    expect(underfilled.followUp.level).toBe("attention");
    expect(underfilled.followUp.reasons.some((reason) => reason.includes("4 seats still open"))).toBe(true);

    const missing = buildHostGroupHealth(base({ missingContactCount: 2 }));
    expect(missing.followUp.level).toBe("attention");
    expect(missing.followUp.reasons.some((reason) => reason.includes("2 guests are missing"))).toBe(true);

    const neverOpened = buildHostGroupHealth(base({ lastActivityAt: null }));
    expect(neverOpened.followUp.reasons.some((reason) => reason.includes("hasn't opened"))).toBe(true);
  });

  it("handles an uncapped group without inventing remaining seats", () => {
    const health = buildHostGroupHealth(base({ capacity: null, activeRegistrations: 5 }));
    expect(health.remaining).toBeNull();
    expect(health.fillRate).toBeNull();
    expect(health.followUp.level).toBe("ok");
  });
});

describe("sortByFollowUp and summary", () => {
  it("surfaces urgent groups first, then the most open seats", () => {
    const rows = [
      buildHostGroupHealth(base({ groupId: "ok", activeRegistrations: 10 })),
      buildHostGroupHealth(base({ groupId: "open4", activeRegistrations: 6 })),
      buildHostGroupHealth(base({ groupId: "urgent", linkStatus: "none" })),
      buildHostGroupHealth(base({ groupId: "open8", activeRegistrations: 2 })),
    ];
    expect(sortByFollowUp(rows).map((row) => row.groupId)).toEqual(["urgent", "open8", "open4", "ok"]);
  });

  it("summarizes follow-up counts, open seats, and missing contacts", () => {
    const rows = [
      buildHostGroupHealth(base({ activeRegistrations: 6, missingContactCount: 1 })),
      buildHostGroupHealth(base({ linkStatus: "none", activeRegistrations: 0 })),
      buildHostGroupHealth(base()),
    ];
    expect(summarizeHostHealth(rows)).toEqual({ groups: 3, needsFollowUp: 2, urgent: 1, openSeats: 14, missingContacts: 1 });
  });
});
