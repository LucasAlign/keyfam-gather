import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createSession, SESSION_COOKIE } from "../src/lib/session";
import { createHostToken } from "../src/lib/host-access";
import { rotateHostAccessCredential } from "../src/lib/host-access-management";
import { createCheckInToken } from "../src/lib/checkin-token";
import type { AttendanceCommand, AttendanceResult } from "../src/lib/attendance-contract";
import { cancelRegistration, reactivateRegistration } from "../src/lib/registration-lifecycle";
import { createInvitationToken } from "../src/lib/invitations";
import { recordInvitationDelivery } from "../src/lib/invitation-delivery";

const prisma = new PrismaClient();
const baseUrl = process.env.GATHER_VERIFY_URL ?? "http://127.0.0.1:3000";
const email = process.env.SEED_ADMIN_EMAIL ?? process.env.DEMO_USER_EMAIL ?? "admin@gather.local";
const secret = process.env.AUTH_SESSION_SECRET ?? process.env.DEMO_AUTH_SECRET;
if (!secret) throw new Error("AUTH_SESSION_SECRET is required.");
const sessionCookieFor = (actorEmail: string, version: number) => `${SESSION_COOKIE}=${createSession({ email: actorEmail, version }, secret)}`;
let cookie = "";

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function deliver(eventId: string, commands: AttendanceCommand[], sessionCookie = cookie) {
  const response = await fetch(`${baseUrl}/events/${eventId}/check-in/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Sync route returned ${response.status}: ${await response.text()}`);
  return (await response.json() as { results: AttendanceResult[] }).results;
}
async function resolveQr(eventId: string, token: string, sessionCookie = cookie) {
  const response = await fetch(`${baseUrl}/events/${eventId}/check-in/qr`, { method: "POST", headers: { "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: JSON.stringify({ token }) });
  return { status: response.status, body: await response.json().catch(() => ({})) as { registrationId?: string; error?: string } };
}

async function main() {
 const suffix = randomUUID();
 let eventId: string | null = null;
 let otherEventId: string | null = null;
 let otherOrganizationId: string | null = null;
 const userIds: string[] = [];
 const personIds: string[] = [];
 try {
  const liveness = await fetch(`${baseUrl}/healthz`);
  check(liveness.status === 200 && (await liveness.json() as { status?: string }).status === "ok", "Liveness probe must report ok without authentication.");
  check(liveness.headers.get("Cache-Control") === "no-store", "Liveness probe must not be cached.");
  const readiness = await fetch(`${baseUrl}/readyz`);
  check(readiness.status === 200 && (await readiness.json() as { database?: string }).database === "ok", "Readiness probe must confirm the database is reachable.");
  console.log("PostgreSQL verification passed: liveness and readiness probes.");

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: "demo-organization" } });
  const actor = await prisma.user.findUniqueOrThrow({ where: { email } });
  cookie = sessionCookieFor(actor.email, actor.sessionVersion);
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
  const staffCookie = sessionCookieFor(staff.email, staff.sessionVersion);
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
  const crossTenant = (await deliver(otherOrgEvent.id, [{ ...winningCommand, eventId: otherOrgEvent.id, registrationId: otherRegistration.id }], sessionCookieFor(otherAdmin.email, otherAdmin.sessionVersion)))[0];
  check(crossTenant.code === "OPERATION_ID_REUSED" && crossTenant.canonical.registrationId === otherRegistration.id && crossTenant.canonical.version === 0, "Cross-organization operation reuse must reveal no prior tenant state.");
  check(await prisma.attendanceOperation.count({ where: { eventId: event.id, operationId: winningCommand.operationId } }) === 1, "An idempotent operation must be stored exactly once.");

  const qrPerson = await prisma.person.create({ data: { organizationId: organization.id, firstName: "Qr", lastName: "Guest" } });
  personIds.push(qrPerson.id);
  const qrRegistration = await prisma.registration.create({ data: { organizationId: organization.id, eventId: event.id, personId: qrPerson.id } });
  const qrIssued = createCheckInToken();
  await prisma.checkInToken.create({ data: { organizationId: organization.id, eventId: event.id, registrationId: qrRegistration.id, tokenHash: qrIssued.tokenHash } });

  const invalidQr = await resolveQr(event.id, "not-a-real-token");
  check(invalidQr.status === 404, "An unknown QR token must be rejected.");
  const firstScan = await resolveQr(event.id, qrIssued.token);
  check(firstScan.status === 200 && firstScan.body.registrationId === qrRegistration.id, "A valid QR token must resolve to its registration.");
  const qrCheckIn = (await deliver(event.id, [{ operationId: randomUUID(), eventId: event.id, registrationId: qrRegistration.id, deviceId: "qr-station", kind: "CHECK_IN", occurredAt: new Date().toISOString(), expectedVersion: null }]))[0];
  check(qrCheckIn.disposition === "APPLIED", "The registration resolved from a QR token must check in through the same attendance path as manual check-in.");

  const secondScan = await resolveQr(event.id, qrIssued.token);
  check(secondScan.status === 200 && secondScan.body.registrationId === qrRegistration.id, "Re-scanning an active QR token must still resolve its registration.");
  const qrRecheck = (await deliver(event.id, [{ operationId: randomUUID(), eventId: event.id, registrationId: qrRegistration.id, deviceId: "qr-station-2", kind: "CHECK_IN", occurredAt: new Date().toISOString(), expectedVersion: null }]))[0];
  check(qrRecheck.code === "ALREADY_CHECKED_IN", "A repeat QR check-in must be idempotent rather than duplicating attendance.");
  check(await prisma.checkIn.count({ where: { registrationId: qrRegistration.id, reversedAt: null } }) === 1, "QR check-in must not create duplicate attendance.");

  const revokedQr = createCheckInToken();
  await prisma.checkInToken.create({ data: { organizationId: organization.id, eventId: event.id, registrationId: qrRegistration.id, tokenHash: revokedQr.tokenHash, revokedAt: new Date() } });
  check((await resolveQr(event.id, revokedQr.token)).status === 404, "A revoked QR token must be rejected.");

  const expiredQr = createCheckInToken(new Date(Date.now() - 60_000));
  await prisma.checkInToken.create({ data: { organizationId: organization.id, eventId: event.id, registrationId: qrRegistration.id, tokenHash: expiredQr.tokenHash, expiresAt: expiredQr.expiresAt } });
  check((await resolveQr(event.id, expiredQr.token)).status === 404, "An expired QR token must be rejected.");

  check((await resolveQr(otherEvent.id, qrIssued.token)).status === 404, "A QR token must not resolve under a different event.");
  check((await resolveQr(event.id, qrIssued.token, staffCookie)).status === 200, "Assigned event staff must be able to resolve a QR token for their event.");
  check((await resolveQr(otherEvent.id, qrIssued.token, staffCookie)).status === 403, "Event staff must be rejected resolving a QR token for an unassigned event.");
  check((await resolveQr(event.id, qrIssued.token, "")).status === 403, "Unauthenticated QR resolution must be rejected.");
  console.log("PostgreSQL verification passed: QR check-in resolution, idempotent re-scan, invalid/expired/revoked tokens, and tenant/event isolation.");

  const deliveryInvitation = await prisma.invitation.create({ data: {
    organizationId: organization.id, eventId: event.id, senderId: actor.id,
    firstName: "Delivery", lastName: "Test", email: `delivery-${suffix}@example.test`, emailNormalized: `delivery-${suffix}@example.test`,
    tokenHash: createInvitationToken().tokenHash, expiresAt: new Date(Date.now() + 86_400_000), status: "SENT", sentAt: new Date(),
  } });
  const emailAttempt = await recordInvitationDelivery({ organizationId: organization.id, eventId: event.id, invitationId: deliveryInvitation.id, actorId: actor.id, firstName: "Delivery", email: deliveryInvitation.email, phone: deliveryInvitation.phone, link: `${baseUrl}/invite/example-token-1`, eventName: event.name });
  check(emailAttempt !== null && emailAttempt.status === "SENT" && emailAttempt.provider === "log" && emailAttempt.channel === "EMAIL", "The default log provider must record a sent email delivery attempt.");
  check(await prisma.deliveryAttempt.count({ where: { invitationId: deliveryInvitation.id } }) === 1, "Send must record exactly one delivery attempt.");
  check(await prisma.auditLog.count({ where: { eventId: event.id, entityId: emailAttempt!.id, action: "invitation.delivery_sent" } }) === 1, "A recorded delivery must write exactly one audit entry.");

  const smsInvitation = await prisma.invitation.create({ data: {
    organizationId: organization.id, eventId: event.id, senderId: actor.id,
    firstName: "Sms", lastName: "Test", phone: "+15555550123", phoneNormalized: "+15555550123",
    tokenHash: createInvitationToken().tokenHash, expiresAt: new Date(Date.now() + 86_400_000), status: "SENT", sentAt: new Date(),
  } });
  const smsAttempt = await recordInvitationDelivery({ organizationId: organization.id, eventId: event.id, invitationId: smsInvitation.id, actorId: actor.id, firstName: "Sms", email: null, phone: smsInvitation.phone, link: `${baseUrl}/invite/example-token-2`, eventName: event.name });
  check(smsAttempt !== null && smsAttempt.channel === "SMS", "Delivery must fall back to SMS when an invitation has only a phone number.");

  const noContactInvitation = await prisma.invitation.create({ data: {
    organizationId: organization.id, eventId: event.id, senderId: actor.id,
    firstName: "NoContact", lastName: "Test",
    tokenHash: createInvitationToken().tokenHash, expiresAt: new Date(Date.now() + 86_400_000), status: "DRAFT",
  } });
  const skippedAttempt = await recordInvitationDelivery({ organizationId: organization.id, eventId: event.id, invitationId: noContactInvitation.id, actorId: actor.id, firstName: "NoContact", email: null, phone: null, link: `${baseUrl}/invite/example-token-3`, eventName: event.name });
  check(skippedAttempt === null, "Delivery must be skipped, not recorded, for an invitation with no contact details.");
  check(await prisma.deliveryAttempt.count({ where: { invitationId: noContactInvitation.id } }) === 0, "Skipped delivery must not create a delivery attempt row.");
  console.log("PostgreSQL verification passed: invitation delivery interface, provider selection, and delivery/audit recording via the log provider.");

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
