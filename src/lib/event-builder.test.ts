import { describe, expect, it } from "vitest";
import { proposeEventBuild } from "./event-builder";
describe("natural-language Event builder", () => {
  it("turns a banquet description into a reviewable proposal", () => { const proposal = proposeEventBuild("We are holding a fundraising banquet for 250 people with 25 Tables of 10."); expect(proposal).toMatchObject({ eventType: "Fundraising banquet", capacity: 250, tableCount: 25, seatsPerTable: 10 }); expect(proposal.assumptions.join(" ")).toMatch(/exactly cover/); expect(proposal.missingRequired).toContain("Start date and time"); });
  it("reports incomplete layout instead of inventing it", () => { const proposal = proposeEventBuild("A community dinner"); expect(proposal.tableCount).toBeNull(); expect(proposal.assumptions[0]).toMatch(/not fully specified/); });
  it("extracts supplied setup details without replacing them with generic defaults", () => {
    const proposal = proposeEventBuild("We are holding the Key Families Hope Gala, a fundraising banquet for 250 people with 25 tables of 10 on October 17, 2026 at 6:00 PM at Riverside Community Center in Nashville. Registration should open publicly on September 10 and close October 15. Our contact is Jordan Lee at jordan@example.test.");
    expect(proposal).toMatchObject({ name: "Key Families Hope Gala", startsAt: "2026-10-17T18:00", venue: "Riverside Community Center", address: "Nashville", registrationOpensAt: "2026-09-10T00:00", registrationClosesAt: "2026-10-15T00:00", isPublic: true, contactName: "Jordan Lee", contactEmail: "jordan@example.test" });
    expect(proposal.missingRequired).not.toContain("Start date and time");
    expect(proposal.missingRequired).toContain("End date and time");
  });
});
