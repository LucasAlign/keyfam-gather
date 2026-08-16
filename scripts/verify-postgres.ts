import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createDemoSession, DEMO_SESSION_COOKIE } from "../src/lib/demo-session";
import { createHostToken } from "../src/lib/host-access";
import { rotateHostAccessCredential } from "../src/lib/host-access-management";
import type { AttendanceCommand, AttendanceResult } from "../src/lib/attendance-contract";
import { cancelRegistration, reactivateRegistration } from "../src/lib/registration-lifecycle";

const prisma = new PrismaClient();
const baseUrl = process.env.GATHER_VERIFY_URL ?? "http://127.0.0.1:3000";
const email = process.env.DEMO_USER_EMAIL ?? "admin@gather.local";
const secret = process.env.DEMO_AUTH_SECRET;
if (!secret) throw new Error("DEMO_AUTH_SECRET is required.");
const cookie = `${DEMO_SESSION_COOKIE}=${createDemoSession(email, secret)}`;

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function deliver(eventId: string, commands: AttendanceCommand[], sessionCookie = cookie) {
  const response = await fetch(`${baseUrl}/events/${eventId}/check-in/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Sync route returned ${response.status}: ${await response.text()}`);
  return (await response.json() as { results: AttendanceResult[] }).results;
}

async function main() {
 const suffix = randomUUID();
 let eventId: string | null = null;
 let otherEventId: string | null = null;
 let otherOrganizationId: string | null = null;
 const userIds: string[] = [];
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
  const recheck = (await deliver(event.id, [make(randomUUID(), "station-recheck")]))[0];
  check(recheck.disposition === "APPLIED" && recheck.canonical.version > winner.canonical.version, "A reversed registration must support a versioned re-check-in.");
  const staleAfterRecheck = (await deliver(event.id, [{ ...undo, operationId: randomUUID() }]))[0];
  check(staleAfterRecheck.code === "STALE_VERSION" && staleAfterRecheck.canonical.version === recheck.canonical.version, "A delayed undo must not reverse a newer check-in.");

  const isolated = (await deliver(otherEvent.id, [{ ...make(randomUUID(), "station-isolation"), eventId: otherEvent.id }]))[0];
  check(isolated.code === "NOT_FOUND", "A registration from another event must not be addressable through the sync route.");

  const staff = await prisma.user.create({ data: { email: `staff-${suffix}@example.test`, name: "Event Staff", memberships: { create: { organizationId: organization.id, role: "MEMBER" } }, eventAssignments: { create: { organizationId: organization.id, eventId: event.id, role: "EVENT_STAFF" } } } });
  userIds.push(staff.id);
  const staffCookie = `${DEMO_SESSION_COOKIE}=${createDemoSession(staff.email, secret!)}`;
  const staffAllowed = (await deliver(event.id, [make(randomUUID(), "staff-station")], staffCookie))[0];
  check(staffAllowed.code === "ALREADY_CHECKED_IN", "Assigned event staff must be allowed to synchronize attendance.");
  const unassigned = (await deliver(otherEvent.id, [{ ...make(randomUUID(), "staff-other"), eventId: otherEvent.id }], staffCookie))[0];
  check(unassigned.code === "FORBIDDEN", "Event staff must be rejected for an unassigned event.");
  const unauthenticated = (await deliver(event.id, [make(randomUUID(), "anonymous")], ""))[0];
  check(unauthenticated.code === "FORBIDDEN", "Unauthenticated attendance delivery must be rejected.");

  const lifecycleGroup = await prisma.group.create({ data: { organizationId: organization.id, eventId: event.id, name: `Lifecycle group ${suffix}`, capacity: 1 } });
  await prisma.registration.update({ where: { id: registration.id }, data: { groupId: lifecycleGroup.id } });
  const cancelled = await cancelRegistration({ organizationId: organization.id, eventId: event.id, registrationId: registration.id, actorId: actor.id });
  check(cancelled.changed && cancelled.registration.status === "CANCELLED", "Cancellation must transition an active registration.");
  const cancelledCheckIn = await prisma.checkIn.findUniqueOrThrow({ where: { registrationId: registration.id } });
  check(cancelledCheckIn.reversedAt !== null && cancelledCheckIn.version === recheck.canonical.version + 1, "Cancellation must reverse active attendance and advance its version.");
  const duplicateCancellation = await cancelRegistration({ organizationId: organization.id, eventId: event.id, registrationId: registration.id, actorId: actor.id });
  check(!duplicateCancellation.changed, "Repeated cancellation must be idempotent.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, entityId: registration.id, action: "registration.cancelled" } }) === 1, "Cancellation must write exactly one audit record.");
  const cancelledDelivery = (await deliver(event.id, [make(randomUUID(), "cancelled-registration")]))[0];
  check(cancelledDelivery.code === "NOT_FOUND", "Cancelled registrations must not be available to attendance delivery.");

  const capacityPerson = await prisma.person.create({ data: { organizationId: organization.id, firstName: "Capacity", lastName: "Occupant" } });
  personIds.push(capacityPerson.id);
  const capacityRegistration = await prisma.registration.create({ data: { organizationId: organization.id, eventId: event.id, personId: capacityPerson.id, groupId: lifecycleGroup.id } });
  await reactivateRegistration({ organizationId: organization.id, eventId: event.id, registrationId: registration.id, actorId: actor.id }).then(
    () => { throw new Error("Restoration must reject a full retained group."); },
    (error: unknown) => check(error instanceof Error && error.message.includes("capacity"), "Restoration must report retained group capacity."),
  );
  await prisma.registration.delete({ where: { id: capacityRegistration.id } });
  const restored = await reactivateRegistration({ organizationId: organization.id, eventId: event.id, registrationId: registration.id, actorId: actor.id });
  check(restored.changed && restored.registration.status === "ACTIVE" && restored.registration.cancelledAt === null, "Restoration must reactivate the registration after capacity is available.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, entityId: registration.id, action: "registration.reactivated" } }) === 1, "Restoration must be audited exactly once.");
  const restoredCheckIn = (await deliver(event.id, [make(randomUUID(), "restored-registration")]))[0];
  check(restoredCheckIn.disposition === "APPLIED", "A restored registration must be check-in eligible without reviving old attendance.");

  const otherOrganization = await prisma.organization.create({ data: { name: `Other ${suffix}` } });
  otherOrganizationId = otherOrganization.id;
  const otherAdmin = await prisma.user.create({ data: { email: `admin-${suffix}@other.test`, name: "Other Admin", memberships: { create: { organizationId: otherOrganization.id, role: "ORGANIZATION_ADMIN" } } } });
  userIds.push(otherAdmin.id);
  const otherPerson = await prisma.person.create({ data: { organizationId: otherOrganization.id, firstName: "Other", lastName: "Guest" } });
  const otherOrgEvent = await prisma.event.create({ data: { organizationId: otherOrganization.id, name: `Other event ${suffix}`, startsAt: new Date("2026-09-04T18:00:00Z"), endsAt: new Date("2026-09-04T22:00:00Z"), timezone: "America/New_York" } });
  const otherRegistration = await prisma.registration.create({ data: { organizationId: otherOrganization.id, eventId: otherOrgEvent.id, personId: otherPerson.id } });
  const crossTenant = (await deliver(otherOrgEvent.id, [{ ...winningCommand, eventId: otherOrgEvent.id, registrationId: otherRegistration.id }], `${DEMO_SESSION_COOKIE}=${createDemoSession(otherAdmin.email, secret!)}`))[0];
  check(crossTenant.code === "OPERATION_ID_REUSED" && crossTenant.canonical.registrationId === otherRegistration.id && crossTenant.canonical.version === 0, "Cross-organization operation reuse must reveal no prior tenant state.");
  check(await prisma.attendanceOperation.count({ where: { eventId: event.id, operationId: winningCommand.operationId } }) === 1, "An idempotent operation must be stored exactly once.");

  const hostGroup = await prisma.group.create({ data: { organizationId: organization.id, eventId: event.id, name: `Host group ${suffix}` } });
  const eventHost = await prisma.eventHost.create({ data: { organizationId: organization.id, eventId: event.id, personId: person.id, groupId: hostGroup.id } });
  const initialAccess = createHostToken();
  const accessRecord = await prisma.hostAccessToken.create({ data: { eventHostId: eventHost.id, tokenHash: initialAccess.tokenHash, expiresAt: initialAccess.expiresAt } });
  const rotationInput = { organizationId: organization.id, eventId: event.id, actorId: actor.id, tokenId: accessRecord.id };
  const rotations = await Promise.allSettled([rotateHostAccessCredential(rotationInput), rotateHostAccessCredential(rotationInput)]);
  check(rotations.filter((item) => item.status === "fulfilled").length === 1, "Concurrent host-link rotation must issue exactly one replacement.");
  check(await prisma.hostAccessToken.count({ where: { eventHostId: eventHost.id, revokedAt: null, expiresAt: { gt: new Date() } } }) === 1, "A host must have exactly one active credential after concurrent rotation.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, action: "host.access_rotated" } }) === 1, "Concurrent rotation must audit exactly one replacement.");
console.log("PostgreSQL verification passed: attendance concurrency/idempotency/undo, registration cancellation/restoration/capacity, authentication, staff assignment, tenant isolation, and exclusive host-token rotation.");
  void actor;
 } finally {
  if (eventId || otherEventId) await prisma.auditLog.deleteMany({ where: { eventId: { in: [eventId, otherEventId].filter((id): id is string => Boolean(id)) } } });
  if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
  if (otherEventId) await prisma.event.deleteMany({ where: { id: otherEventId } });
  if (personIds.length) await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  if (otherOrganizationId) await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
 }
}

void main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
