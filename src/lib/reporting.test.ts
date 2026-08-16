import { describe, expect, it } from "vitest";
import { buildEventReporting, renderReportCsv, type EventReportingInput } from "./reporting";

const input: EventReportingInput = {
  registrations: [
    { id: "r1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: null, source: "INVITATION", status: "ACTIVE", registeredAt: new Date("2026-08-01T12:00:00Z"), cancelledAt: null, group: "Analytical", table: "Table 1", party: null, checkedInAt: new Date("2026-08-13T18:00:00Z") },
    { id: "r2", firstName: "Grace", lastName: "Hopper, Jr.", email: null, phone: "555-0102", source: "WALK_IN", status: "ACTIVE", registeredAt: new Date("2026-08-13T18:05:00Z"), cancelledAt: null, group: null, table: null, party: null, checkedInAt: null },
    { id: "r3", firstName: "Katherine", lastName: "Johnson", email: null, phone: null, source: "STAFF", status: "ACTIVE", registeredAt: new Date("2026-08-02T12:00:00Z"), cancelledAt: null, group: "Analytical", table: "Table 1", party: null, checkedInAt: new Date("2026-08-13T18:10:00Z") },
    { id: "r4", firstName: "Cancelled", lastName: "Guest", email: null, phone: "555-0104", source: "HOST", status: "CANCELLED", registeredAt: new Date("2026-08-03T12:00:00Z"), cancelledAt: new Date("2026-08-10T12:00:00Z"), group: "Analytical", table: "Table 1", party: null, checkedInAt: null },
  ],
  hosts: [{ firstName: "Alan", lastName: "Turing", email: null, phone: null, group: "Analytical" }],
  groups: [{ name: "Analytical", capacity: 2, registrationIds: ["r1", "r3", "r4"] }],
  tables: [{ name: "Table 1", capacity: 1, registrationIds: ["r1", "r3", "r4"] }],
  invitations: [{ firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: null, status: "REGISTERED", group: "Analytical", sender: "Admin", sentAt: new Date("2026-08-01T10:00:00Z"), openedAt: new Date("2026-08-01T11:00:00Z"), respondedAt: new Date("2026-08-01T12:00:00Z"), registered: true }],
};

describe("event reporting module interface", () => {
  it("derives the command-center metrics from canonical registration state", () => {
    expect(buildEventReporting(input).metrics).toEqual({ registered: 3, checkedIn: 2, attendancePercent: 67, notArrived: 1, walkIns: 1, unassignedGuests: 1, tableIssues: 1 });
  });

  it("derives attendance, capacity, and invitation conversion reports", () => {
    const report = buildEventReporting(input);
    expect(report.noShows.map((item) => item.id)).toEqual(["r2"]);
    expect(report.tables[0]).toMatchObject({ assigned: 2, checkedIn: 2, remaining: 0, overBy: 1 });
    expect(report.invitationConversion).toMatchObject({ total: 1, delivered: 1, opened: 1, converted: 1, openRate: 100, conversionRate: 100 });
    expect(report.cancellations.map((item) => item.id)).toEqual(["r4"]);
  });

  it("exports spreadsheet-safe UTF-8 CSV with stable canonical fields", () => {
    const csv = renderReportCsv(buildEventReporting(input), "registrations");
    expect(csv.startsWith("\uFEFFFirst name")).toBe(true);
    expect(csv).toContain('Grace,"Hopper, Jr."');
    expect(csv).toContain("2026-08-13T18:00:00.000Z");
    const hostile = buildEventReporting({ ...input, registrations: [{ ...input.registrations[0], firstName: "=HYPERLINK(\"bad\")" }] });
    expect(renderReportCsv(hostile, "registrations")).toContain("'=");
    expect(renderReportCsv(buildEventReporting(input), "cancellations")).toContain("Cancelled,Guest");
  });

  it("avoids invalid percentages when no invitations or registrations exist", () => {
    const report = buildEventReporting({ registrations: [], hosts: [], groups: [], tables: [], invitations: [] });
    expect(report.metrics.attendancePercent).toBe(0);
    expect(report.invitationConversion.openRate).toBe(0);
    expect(report.invitationConversion.conversionRate).toBe(0);
  });
});
