import { z } from "zod";

export const attendanceCommandSchema = z.object({
  operationId: z.string().uuid(),
  eventId: z.string().min(1),
  registrationId: z.string().min(1),
  deviceId: z.string().min(3).max(160),
  kind: z.enum(["CHECK_IN", "UNDO"]),
  occurredAt: z.iso.datetime(),
  expectedVersion: z.number().int().positive().nullable(),
});

export const attendanceBatchSchema = z.array(attendanceCommandSchema).min(1).max(50);

export type AttendanceCommand = z.infer<typeof attendanceCommandSchema>;
export type AttendanceState = {
  registrationId: string;
  active: boolean;
  checkedInAt: string | null;
  reversedAt: string | null;
  actor: string | null;
  deviceId: string | null;
  version: number;
};
export type AttendanceResultCode = "ALREADY_CHECKED_IN" | "ALREADY_REVERSED" | "UNDO_EXPIRED" | "STALE_VERSION" | "NOT_FOUND" | "FORBIDDEN" | "OPERATION_ID_REUSED";
export type AttendanceResult = {
  operationId: string;
  disposition: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";
  canonical: AttendanceState;
  code?: AttendanceResultCode;
};

export const emptyAttendanceState = (registrationId: string): AttendanceState => ({
  registrationId, active: false, checkedInAt: null, reversedAt: null, actor: null, deviceId: null, version: 0,
});
