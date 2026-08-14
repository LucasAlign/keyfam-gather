import { describe, expect, it } from "vitest";
import { buildDashboardMetrics } from "./event-dashboard";

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
