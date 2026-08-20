import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { AttendanceCommand, AttendanceResult } from "../src/lib/attendance-contract";
import { createSession, SESSION_COOKIE } from "../src/lib/session";

// North-Star acceptance harness (GATHER_HANDOFF.md §2). Seeds a banquet at the
// reference load, checks everyone in across many concurrent "devices" through the
// live HTTP sync route — including duplicate delivery, an offline-then-reconnect
// burst, and same-registration races — then asserts no attendance is lost or
// duplicated, devices converge, seating persists, and the export is accurate.
//
// Requires a running server (the production container or `npm run dev`) at
// GATHER_VERIFY_URL and the matching AUTH_SESSION_SECRET. Cleans up its fixtures.

if (existsSync(".env")) process.loadEnvFile(".env");

const prisma = new PrismaClient();
const baseUrl = process.env.GATHER_VERIFY_URL ?? "http://localhost:3000";
const secretValue = process.env.AUTH_SESSION_SECRET ?? process.env.DEMO_AUTH_SECRET;
if (!secretValue) throw new Error("AUTH_SESSION_SECRET is required.");
const secret: string = secretValue;

const GUESTS = Number(process.env.LOAD_GUESTS ?? 500);
const WALK_INS = Number(process.env.LOAD_WALKINS ?? 10);
const GROUPS = Number(process.env.LOAD_GROUPS ?? 50);
const TABLES = Number(process.env.LOAD_TABLES ?? 50);
const DEVICES = Number(process.env.LOAD_DEVICES ?? 10);
const SEATING_EXCEPTIONS = Number(process.env.LOAD_SEATING_EXCEPTIONS ?? 20);
const OFFLINE = Number(process.env.LOAD_OFFLINE ?? 50); // held back, delivered on "reconnect"
const RACES = Number(process.env.LOAD_RACES ?? 20); // same registration, two devices
const DUP = Number(process.env.LOAD_DUP ?? 20); // duplicate-idempotency subset
const BATCH = 50; // sync route hard cap

let cookie = "";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
async function deliver(eventId: string, commands: AttendanceCommand[]): Promise<AttendanceResult[]> {
  const results: AttendanceResult[] = [];
  for (const group of chunk(commands, BATCH)) {
    const response = await fetch(`${baseUrl}/events/${eventId}/check-in/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(group),
    });
    if (!response.ok) throw new Error(`Sync route returned ${response.status}: ${await response.text()}`);
    results.push(...((await response.json()) as { results: AttendanceResult[] }).results);
  }
  return results;
}
function checkInCommand(eventId: string, registrationId: string, deviceId: string): AttendanceCommand {
  return { operationId: randomUUID(), eventId, registrationId, deviceId, kind: "CHECK_IN", occurredAt: new Date().toISOString(), expectedVersion: null };
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const orgId = `load-org-${suffix}`;
  const adminEmail = `load-admin-${suffix}@gather.local`;
  cookie = `${SESSION_COOKIE}=${createSession({ email: adminEmail, version: 1 }, secret)}`;
  console.log(`North-Star load test: ${GUESTS} guests + ${WALK_INS} walk-ins, ${GROUPS} groups, ${TABLES} tables, ${DEVICES} devices.`);

  try {
    // --- Seed the banquet ---
    const seedStart = Date.now();
    await prisma.organization.create({ data: { id: orgId, name: `Load Org ${suffix}` } });
    await prisma.user.create({ data: { email: adminEmail, name: "Load Admin", memberships: { create: { organizationId: orgId, role: "ORGANIZATION_ADMIN" } } } });
    const event = await prisma.event.create({ data: { organizationId: orgId, name: `Banquet ${suffix}`, startsAt: new Date("2026-09-10T18:00:00Z"), endsAt: new Date("2026-09-10T22:00:00Z"), timezone: "America/New_York" } });

    await prisma.group.createMany({ data: Array.from({ length: GROUPS }, (_, i) => ({ organizationId: orgId, eventId: event.id, name: `Group ${i + 1}` })) });
    await prisma.seatingTable.createMany({ data: Array.from({ length: TABLES }, (_, i) => ({ organizationId: orgId, eventId: event.id, name: `Table ${i + 1}`, capacity: 12 })) });
    const groups = await prisma.group.findMany({ where: { eventId: event.id }, select: { id: true }, orderBy: { name: "asc" } });
    const tables = await prisma.seatingTable.findMany({ where: { eventId: event.id }, select: { id: true }, orderBy: { name: "asc" } });

    const total = GUESTS + WALK_INS;
    await prisma.person.createMany({ data: Array.from({ length: total }, (_, i) => ({ organizationId: orgId, firstName: `Guest${i}`, lastName: `L${suffix}`, email: `load-${suffix}-${i}@example.test`, emailNormalized: `load-${suffix}-${i}@example.test` })) });
    const people = await prisma.person.findMany({ where: { organizationId: orgId }, select: { id: true }, orderBy: { email: "asc" } });

    await prisma.registration.createMany({
      data: people.map((person, i) => ({
        organizationId: orgId,
        eventId: event.id,
        personId: person.id,
        groupId: groups[i % GROUPS].id,
        tableId: tables[i % TABLES].id,
        source: i < GUESTS ? "STAFF" : "WALK_IN",
      })),
    });
    const registrations = await prisma.registration.findMany({ where: { eventId: event.id }, select: { id: true, tableId: true }, orderBy: { registeredAt: "asc" } });
    check(registrations.length === total, `expected ${total} registrations, got ${registrations.length}`);
    console.log(`  Seeded ${registrations.length} registrations in ${Date.now() - seedStart}ms.`);

    // --- Concurrent multi-device check-in through the live sync route ---
    const runStart = Date.now();
    const ids = registrations.map((r) => r.id);
    // Reserve fresh subsets for the race and duplicate-idempotency checks so those
    // registrations are not already checked in when those scenarios run.
    const raceIds = ids.slice(0, RACES);
    const dupIds = ids.slice(RACES, RACES + DUP);
    const rest = ids.slice(RACES + DUP);
    const offline = rest.slice(rest.length - OFFLINE);
    const online = rest.slice(0, rest.length - OFFLINE);

    // Resend-until-acknowledged models the durable offline queue: the sync route
    // may return a partial batch under load, and the client retries its remaining
    // intents until each is acknowledged (applied, duplicate, or canonical conflict).
    const acknowledged = new Set(["APPLIED", "ALREADY_APPLIED", "CONFLICT"]);
    async function checkInUntilAcknowledged(deviceLabel: string, targetIds: string[], maxRounds = 15) {
      const pending = new Set(targetIds);
      for (let round = 0; round < maxRounds && pending.size > 0; round += 1) {
        const results = await deliver(event.id, [...pending].map((id) => checkInCommand(event.id, id, deviceLabel)));
        for (const result of results) if (acknowledged.has(result.disposition)) pending.delete(result.canonical.registrationId);
      }
      return pending;
    }

    // 10 devices check in the online set concurrently, each retrying its own queue.
    const perDevice: string[][] = Array.from({ length: DEVICES }, () => []);
    online.forEach((id, i) => perDevice[i % DEVICES].push(id));
    const leftovers = await Promise.all(perDevice.map((deviceIds, d) => checkInUntilAcknowledged(`station-${d + 1}`, deviceIds)));
    const unconverged = leftovers.reduce((sum, p) => sum + p.size, 0);
    check(unconverged === 0, `all online check-ins must converge (unacknowledged ${unconverged})`);

    // Offline queue delivered on reconnect (simulated 15-minute outage recovery).
    const offlinePending = await checkInUntilAcknowledged("station-offline", offline);
    check(offlinePending.size === 0, "all reconnected offline check-ins must converge");

    // Duplicate delivery: the exact same commands (same operationId and identical
    // payload) twice — the replay must be idempotent, creating no new attendance.
    const dupCommands = dupIds.map((id) => checkInCommand(event.id, id, "station-dup"));
    const firstDup = await deliver(event.id, dupCommands);
    check(firstDup.every((r) => r.disposition === "APPLIED"), "duplicate-test check-ins should apply on first delivery");
    const replay = await deliver(event.id, dupCommands);
    check(replay.every((r) => r.disposition === "ALREADY_APPLIED"), "duplicate operation delivery must be idempotent");

    // Same-registration race: two devices, different operationIds, one fresh
    // registration — exactly one applies, the other sees the canonical conflict.
    const raceOutcomes = await Promise.all(
      raceIds.map(async (id) => {
        const [a, b] = await Promise.all([
          deliver(event.id, [checkInCommand(event.id, id, "race-A")]),
          deliver(event.id, [checkInCommand(event.id, id, "race-B")]),
        ]);
        return [a[0], b[0]];
      }),
    );
    for (const [a, b] of raceOutcomes) {
      const dispositions = [a.disposition, b.disposition].sort().join("+");
      check(a.canonical.active && b.canonical.active, "both race responses must report the canonical active state");
      check(dispositions === "APPLIED+CONFLICT", `a fresh race must yield one applied and one conflict, got ${dispositions}`);
    }
    const runMs = Date.now() - runStart;

    // --- Seating exceptions: move guests to a different table, verify persistence ---
    const movers = registrations.slice(0, SEATING_EXCEPTIONS);
    await Promise.all(
      movers.map((reg) => {
        const nextTable = tables.find((t) => t.id !== reg.tableId)!.id;
        return prisma.registration.update({ where: { id: reg.id }, data: { tableId: nextTable } });
      }),
    );
    const movedBack = await prisma.registration.findMany({ where: { id: { in: movers.map((m) => m.id) } }, select: { id: true, tableId: true } });
    check(movedBack.every((m) => m.tableId !== movers.find((o) => o.id === m.id)!.tableId), "seating moves must persist");

    // --- Integrity assertions: no lost or duplicate attendance ---
    const activeCheckIns = await prisma.checkIn.count({ where: { registration: { eventId: event.id }, reversedAt: null } });
    check(activeCheckIns === total, `exactly one active check-in per registration (got ${activeCheckIns}/${total})`);
    const distinctRegs = await prisma.checkIn.findMany({ where: { registration: { eventId: event.id }, reversedAt: null }, select: { registrationId: true }, distinct: ["registrationId"] });
    check(distinctRegs.length === total, `no duplicate active check-ins (distinct ${distinctRegs.length}/${total})`);
    const audits = await prisma.auditLog.count({ where: { eventId: event.id, action: "checkin.created" } });
    check(audits === total, `every applied check-in is audited once (audits ${audits}/${total})`);

    // --- Export accuracy: the attendance CSV must list every attendee ---
    const exportResponse = await fetch(`${baseUrl}/events/${event.id}/reports/export?report=attendance`, { headers: { Cookie: cookie } });
    check(exportResponse.ok, `attendance export returned ${exportResponse.status}`);
    const rows = (await exportResponse.text()).trim().split("\n");
    const dataRows = rows.length - 1; // minus header
    check(dataRows === total, `attendance export must list every attendee (rows ${dataRows}/${total})`);

    console.log(`  Checked in ${total} attendees across ${DEVICES} concurrent devices in ${runMs}ms (~${Math.round((total / runMs) * 1000)} check-ins/s, including duplicate replays and ${RACES} same-registration races).`);
    console.log(`North-Star load test PASSED: no attendance lost, no duplicates, offline reconnect converged, ${SEATING_EXCEPTIONS} seating moves persisted, export listed all ${total} attendees.`);
  } finally {
    // Cleanup: remove every fixture created under the load organization. Guarded
    // so a cleanup failure never masks the original assertion or runtime error.
    try {
      await prisma.checkIn.deleteMany({ where: { organizationId: orgId } });
      await prisma.attendanceOperation.deleteMany({ where: { organizationId: orgId } });
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
      await prisma.registration.deleteMany({ where: { organizationId: orgId } });
      await prisma.group.deleteMany({ where: { organizationId: orgId } });
      await prisma.seatingTable.deleteMany({ where: { organizationId: orgId } });
      await prisma.event.deleteMany({ where: { organizationId: orgId } });
      await prisma.person.deleteMany({ where: { organizationId: orgId } });
      await prisma.eventAssignment.deleteMany({ where: { organizationId: orgId } });
      await prisma.membership.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { email: adminEmail } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } catch (cleanupError) {
      console.warn(`Cleanup did not complete (fixtures may remain under ${orgId}):`, cleanupError instanceof Error ? cleanupError.message : cleanupError);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
