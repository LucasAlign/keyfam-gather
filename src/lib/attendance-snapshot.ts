import type { AttendanceCommand, AttendanceResult } from "@/lib/attendance-contract";

export type SnapshotCheckIn = { checkedInAt: string; actor: string; deviceId: string; version: number };
export type AttendanceRegistrant = {
  id: string; name: string; email: string | null; phone: string | null; group: string | null; table: string | null; party: string | null;
  attendanceVersion: number;
  checkIn: SnapshotCheckIn | null;
};
export type AttendanceSnapshot = { eventId: string; fetchedAt: string; registrants: AttendanceRegistrant[] };

export function mergeAttendanceResults(snapshot: AttendanceSnapshot | null, results: AttendanceResult[]): AttendanceSnapshot {
  if (!snapshot) throw new Error("Attendance snapshot is unavailable.");
  const byRegistration = new Map(results.map((item) => [item.canonical.registrationId, item.canonical]));
  return {
    ...snapshot,
    fetchedAt: new Date().toISOString(),
    registrants: snapshot.registrants.map((registrant) => {
      const canonical = byRegistration.get(registrant.id);
      if (!canonical) return registrant;
      return { ...registrant, attendanceVersion: canonical.version, checkIn: canonical.active ? { checkedInAt: canonical.checkedInAt!, actor: canonical.actor ?? "Unknown", deviceId: canonical.deviceId ?? "unknown", version: canonical.version } : null };
    }),
  };
}

export function applyPendingAttendance(snapshot: AttendanceSnapshot, commands: AttendanceCommand[]): AttendanceSnapshot {
  return commands.reduce((current, command) => ({
    ...current,
    registrants: current.registrants.map((registrant) => {
      if (registrant.id !== command.registrationId) return registrant;
      const version = registrant.attendanceVersion + 1;
      return {
        ...registrant,
        attendanceVersion: version,
        checkIn: command.kind === "CHECK_IN"
          ? { checkedInAt: command.occurredAt, actor: "Pending sync", deviceId: command.deviceId, version }
          : null,
      };
    }),
  }), snapshot);
}
