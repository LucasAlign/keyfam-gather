import { describe, expect, it } from "vitest";
import { buildLiveBriefing } from "./live-command-center";

describe("live command center", () => {
  it("derives canonical metrics and priority exceptions", () => {
    const result = buildLiveBriefing({ now: new Date("2026-09-07T20:10:00Z"), guests: [{ id: "g1", name: "Sponsor Rep", arrived: false, walkIn: false, tableId: null, vip: false, sponsorRepresentative: true }, { id: "g2", name: "Walk In", arrived: true, walkIn: true, tableId: "t1", vip: false, sponsorRepresentative: false }], tables: [{ id: "t1", name: "Table 1", capacity: 1, assigned: 2 }], operations: [{ deviceId: "door-1", occurredAt: new Date("2026-09-07T20:05:00Z"), disposition: "CONFLICT" }] });
    expect(result.metrics).toEqual({ arrived: 1, remaining: 1, walkIns: 1, unassignedGuests: 1, tableIssues: 1 }); expect(result.alerts.map(({ title }) => title)).toContain("Sponsor Rep has not arrived"); expect(result.staleMinutes).toBe(5);
  });
});
