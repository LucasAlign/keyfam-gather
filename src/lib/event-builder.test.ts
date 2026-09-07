import { describe, expect, it } from "vitest";
import { proposeEventBuild } from "./event-builder";
describe("natural-language Event builder", () => {
  it("turns a banquet description into a reviewable proposal", () => { const proposal = proposeEventBuild("We are holding a fundraising banquet for 250 people with 25 Tables of 10."); expect(proposal).toMatchObject({ eventType: "Fundraising banquet", capacity: 250, tableCount: 25, seatsPerTable: 10 }); expect(proposal.assumptions.join(" ")).toMatch(/exactly cover/); expect(proposal.missingRequired).toContain("Start date and time"); });
  it("reports incomplete layout instead of inventing it", () => { const proposal = proposeEventBuild("A community dinner"); expect(proposal.tableCount).toBeNull(); expect(proposal.assumptions[0]).toMatch(/not fully specified/); });
});
