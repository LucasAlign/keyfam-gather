import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckInWorkspace, type CheckInRegistrant } from "./check-in-workspace";
import { IndexedDbAttendanceQueue, MemoryAttendanceQueue } from "@/lib/attendance-queue";
import type { AttendanceSnapshot } from "@/lib/attendance-snapshot";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions", () => ({ addAndCheckInWalkIn: vi.fn() }));

const registrant: CheckInRegistrant = {
  id: "registration-1",
  name: "Ada Lovelace",
  email: "ada@example.test",
  phone: null,
  group: null,
  table: null,
  party: null,
  attendanceVersion: 0,
  checkIn: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CheckInWorkspace lifecycle", () => {
  it("opens its durable queue once while server refreshes replace the registrant snapshot", async () => {
    const store = new MemoryAttendanceQueue<AttendanceSnapshot>();
    const close = vi.spyOn(store, "close");
    const open = vi.spyOn(IndexedDbAttendanceQueue, "open").mockResolvedValue(store as never);
    const props = { eventId: "event-1", userId: "user-1", canManageWalkIns: false, groups: [], tables: [] };
    const view = render(<CheckInWorkspace {...props} registrants={[registrant]} />);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));

    view.rerender(<CheckInWorkspace {...props} registrants={[{ ...registrant, name: "Ada Byron" }]} />);
    await waitFor(() => expect(view.getByText("Ada Byron")).toBeInTheDocument());
    expect(open).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
