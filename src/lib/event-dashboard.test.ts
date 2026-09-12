import { describe, expect, it } from "vitest";
import { buildDashboardMetrics, dashboardPage } from "./event-dashboard";

describe("event dashboard metrics", () => {
  it("derives live operational exceptions from the minimal dashboard projection", () => {
    const metrics = buildDashboardMetrics({
      registrations: [
        { source: "STAFF", tableId: "table-1", checkIn: { reversedAt: null } },
        { source: "WALK_IN", tableId: null, checkIn: { reversedAt: new Date() } },
        { source: "HOST", tableId: null, checkIn: null },
      ],
      tables: [{ capacity: 1, assigned: 2 }, { capacity: 8, assigned: 4 }],
    });
    expect(metrics).toEqual({ registered: 3, checkedIn: 1, attendancePercent: 33, notArrived: 2, walkIns: 1, unassignedGuests: 2, tableIssues: 1 });
  });
});

describe("dashboard registrant pagination", () => {
  it("clamps pages and exposes navigation without rendering the full guest list", () => {
    expect(dashboardPage(260, 1, 25)).toEqual({ page: 1, pageSize: 25, pageCount: 11, skip: 0, hasPrevious: false, hasNext: true });
    expect(dashboardPage(260, 99, 25)).toEqual({ page: 11, pageSize: 25, pageCount: 11, skip: 250, hasPrevious: true, hasNext: false });
    expect(dashboardPage(0, -2, 25)).toEqual({ page: 1, pageSize: 25, pageCount: 1, skip: 0, hasPrevious: false, hasNext: false });
  });
});
