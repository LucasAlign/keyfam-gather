import { describe, expect, it, vi } from "vitest";
import { MemoryAttendanceQueue, synchronizeAttendance } from "./attendance-queue";
import { mergeAttendanceResults, type AttendanceSnapshot } from "./attendance-snapshot";
import type { AttendanceCommand, AttendanceResult } from "./attendance-contract";

const snapshot: AttendanceSnapshot = { eventId: "event-1", fetchedAt: "2026-08-13T12:00:00.000Z", registrants: [{ id: "registration-1", name: "Ada Lovelace", email: null, phone: null, group: null, table: null, party: null, attendanceVersion: 0, checkIn: null }] };
const command: AttendanceCommand = { operationId: "d96f3a20-c9cb-4d3e-9182-abf320b371f1", eventId: "event-1", registrationId: "registration-1", deviceId: "station-one", kind: "CHECK_IN", occurredAt: "2026-08-13T12:01:00.000Z", expectedVersion: null };
const applied: AttendanceResult = { operationId: command.operationId, disposition: "APPLIED", canonical: { registrationId: command.registrationId, active: true, checkedInAt: "2026-08-13T12:01:01.000Z", reversedAt: null, actor: "Gather Admin", deviceId: command.deviceId, version: 1 } };

describe("attendance queue seam", () => {
  it("retains the identical operation after a network failure and retries it", async () => {
    const store = new MemoryAttendanceQueue<AttendanceSnapshot>(); await store.saveSnapshot(snapshot); await store.enqueue(command);
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([applied]);
    await expect(synchronizeAttendance(store, send, mergeAttendanceResults)).rejects.toThrow("offline");
    expect((await store.pending())[0]).toMatchObject({ operationId: command.operationId, attempts: 1 });
    await synchronizeAttendance(store, send, mergeAttendanceResults);
    expect(send.mock.calls[1][0][0].operationId).toBe(command.operationId);
    expect(await store.pending()).toHaveLength(0);
  });

  it("acknowledges returned results and keeps an unreturned suffix queued", async () => {
    const store = new MemoryAttendanceQueue<AttendanceSnapshot>(); await store.saveSnapshot(snapshot); await store.enqueue(command);
    const second = { ...command, operationId: "4a534b06-f171-4fbc-b7f3-bf3b49738b54", kind: "UNDO" as const, expectedVersion: 1 };
    await store.enqueue(second);
    await synchronizeAttendance(store, async () => [applied], mergeAttendanceResults);
    expect((await store.pending()).map((item) => item.operationId)).toEqual([second.operationId]);
    expect((await store.loadSnapshot())?.registrants[0].checkIn?.version).toBe(1);
  });

  it("records terminal conflicts until the operator acknowledges them", async () => {
    const store = new MemoryAttendanceQueue<AttendanceSnapshot>(); await store.saveSnapshot(snapshot); await store.enqueue(command);
    const conflict: AttendanceResult = { ...applied, disposition: "CONFLICT", code: "ALREADY_CHECKED_IN" };
    await synchronizeAttendance(store, async () => [conflict], mergeAttendanceResults);
    expect((await store.conflicts())[0].result.code).toBe("ALREADY_CHECKED_IN");
    await store.clearConflict(command.operationId);
    expect(await store.conflicts()).toEqual([]);
  });
});
