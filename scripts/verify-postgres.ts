import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createDemoSession, DEMO_SESSION_COOKIE } from "../src/lib/demo-session";
import type { AttendanceCommand, AttendanceResult } from "../src/lib/attendance-contract";

const prisma = new PrismaClient();
const baseUrl = process.env.GATHER_VERIFY_URL ?? "http://127.0.0.1:3000";
const email = process.env.DEMO_USER_EMAIL ?? "admin@gather.local";
const secret = process.env.DEMO_AUTH_SECRET;
if (!secret) throw new Error("DEMO_AUTH_SECRET is required.");
const cookie = `${DEMO_SESSION_COOKIE}=${createDemoSession(email, secret)}`;

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function deliver(eventId: string, commands: AttendanceCommand[]) {
  const response = await fetch(`${baseUrl}/events/${eventId}/check-in/sync`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Sync route returned ${response.status}: ${await response.text()}`);
  return (await response.json() as { results: AttendanceResult[] }).results;
}

async function main() {
 const suffix = randomUUID();
 let eventId: string | null = null;
 let otherEventId: string | null = null;
 const personIds: string[] = [];
 try {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: "demo-organization" } });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email } });
  const event = await prisma.event.create({ data: { organizationId: organization.id, name: `Concurrency ${suffix}`, startsAt: new Date("2026-09-02T18:00:00Z"), endsAt: new Date("2026-09-02T22:00:00Z"), timezone: "America/New_York" } });
  eventId = event.id;
  const otherEvent = await prisma.event.create({ data: { organizationId: organization.id, name: `Isolation ${suffix}`, startsAt: new Date("2026-09-03T18:00:00Z"), endsAt: new Date("2026-09-03T22:00:00Z"), timezone: "America/New_York" } });
  otherEventId = otherEvent.id;
  const person = await prisma.person.create({ data: { organizationId: organization.id, firstName: "Concurrent", lastName: "Guest", email: `${suffix}@example.test`, emailNormalized: `${suffix}@example.test` } });
  personIds.push(person.id);
  const registration = await prisma.registration.create({ data: { organizationId: organization.id, eventId: event.id, personId: person.id } });
  const make = (operationId: string, deviceId: string): AttendanceCommand => ({ operationId, eventId: event.id, registrationId: registration.id, deviceId, kind: "CHECK_IN", occurredAt: new Date().toISOString(), expectedVersion: null });
  const first = make(randomUUID(), "station-one");
  const second = make(randomUUID(), "station-two");
  const [firstDelivery, secondDelivery] = await Promise.all([deliver(event.id, [first]), deliver(event.id, [second])]);
  const concurrent = [firstDelivery[0], secondDelivery[0]];
  check(concurrent.filter((item) => item.disposition === "APPLIED").length === 1, "Concurrent check-in must apply exactly once.");
  check(concurrent.filter((item) => item.code === "ALREADY_CHECKED_IN").length === 1, "Losing station must receive the canonical active conflict.");
  check(await prisma.checkIn.count({ where: { registrationId: registration.id, reversedAt: null } }) === 1, "Database must contain one active CheckIn.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, action: "checkin.created" } }) === 1, "Concurrent delivery must audit one applied check-in.");

  const winner = concurrent.find((item) => item.disposition === "APPLIED")!;
  const winningCommand = winner.operationId === first.operationId ? first : second;
  const replay = (await deliver(event.id, [winningCommand]))[0];
  check(replay.disposition === "ALREADY_APPLIED" && replay.canonical.version === winner.canonical.version, "Duplicate operation must return its stored canonical result.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, action: "checkin.created" } }) === 1, "Duplicate operation must not create another audit.");
  const altered = (await deliver(event.id, [{ ...winningCommand, deviceId: "altered-station" }]))[0];
  check(altered.code === "OPERATION_ID_REUSED", "Altered payload with a reused operation ID must be rejected.");

  const undo: AttendanceCommand = { operationId: randomUUID(), eventId: event.id, registrationId: registration.id, deviceId: "station-one", kind: "UNDO", occurredAt: new Date().toISOString(), expectedVersion: winner.canonical.version };
  const undoResult = (await deliver(event.id, [undo]))[0];
  check(undoResult.disposition === "APPLIED" && !undoResult.canonical.active, "Expected-version undo must reverse the check-in.");
  const staleUndo = (await deliver(event.id, [{ ...undo, operationId: randomUUID() }]))[0];
  check(staleUndo.code === "ALREADY_REVERSED", "Repeated undo intent must converge on the canonical reversed state.");

  const isolated = (await deliver(otherEvent.id, [{ ...make(randomUUID(), "station-isolation"), eventId: otherEvent.id }]))[0];
  check(isolated.code === "NOT_FOUND", "A registration from another event must not be addressable through the sync route.");
  check(await prisma.attendanceOperation.count({ where: { eventId: event.id } }) === 4, "Applied, conflicting, and undo operations must be stored exactly once.");
  console.log("PostgreSQL attendance verification passed: concurrency, idempotency, undo, and event isolation.");
  void actor;
 } finally {
  if (eventId || otherEventId) await prisma.auditLog.deleteMany({ where: { eventId: { in: [eventId, otherEventId].filter((id): id is string => Boolean(id)) } } });
  if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
  if (otherEventId) await prisma.event.deleteMany({ where: { id: otherEventId } });
  if (personIds.length) await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.$disconnect();
 }
}

void main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
