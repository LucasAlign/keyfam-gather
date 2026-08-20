import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCheckInTokenScope, createCheckInToken, hashCheckInToken, isCheckInTokenActive } from "@/lib/checkin-token";
import { withSerializableRetry } from "@/lib/transactions";

type CheckInTokenMutation = { organizationId: string; eventId: string; registrationId: string; actorId: string };

const retryConflict = () => new Prisma.PrismaClientKnownRequestError("Check-in token changed", {
  code: "P2034",
  clientVersion: Prisma.prismaVersion.client,
});

async function requireScopedRegistration(tx: Prisma.TransactionClient, input: { organizationId: string; eventId: string; registrationId: string }) {
  const registration = await tx.registration.findFirst({ where: { id: input.registrationId, organizationId: input.organizationId, eventId: input.eventId, status: "ACTIVE" } });
  if (!registration) throw new Error("This registration is not available for this event.");
  return registration;
}

// Issues a QR token only when this registration has no active credential yet,
// mirroring the host-token "reveal once" model: the raw token is returned here
// and never persisted, only its digest is stored.
export async function issueCheckInToken(input: CheckInTokenMutation) {
  const issued = createCheckInToken();
  await withSerializableRetry(async (tx) => {
    const registration = await requireScopedRegistration(tx, input);
    const active = await tx.checkInToken.findFirst({ where: { registrationId: registration.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (active) throw new Error("This registration already has an active QR code. Reissue it instead.");
    const created = await tx.checkInToken.create({ data: { organizationId: input.organizationId, eventId: input.eventId, registrationId: registration.id, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId,
      action: "checkin_token.issued", entityType: "CheckInToken", entityId: created.id,
      newState: JSON.stringify({ registrationId: registration.id, expiresAt: issued.expiresAt }),
    } });
  });
  return issued.token;
}

// Revokes any currently active QR token for this registration and issues a
// replacement in the same transaction, so a lost or compromised badge can be
// invalidated without leaving a gap where no credential exists.
export async function reissueCheckInToken(input: CheckInTokenMutation) {
  const issued = createCheckInToken();
  await withSerializableRetry(async (tx) => {
    const registration = await requireScopedRegistration(tx, input);
    const active = await tx.checkInToken.findFirst({ where: { registrationId: registration.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    const revokedAt = new Date();
    if (active) {
      const changed = await tx.checkInToken.updateMany({ where: { id: active.id, revokedAt: null }, data: { revokedAt } });
      if (changed.count !== 1) throw retryConflict();
    }
    const created = await tx.checkInToken.create({ data: { organizationId: input.organizationId, eventId: input.eventId, registrationId: registration.id, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId,
      action: "checkin_token.reissued", entityType: "CheckInToken", entityId: created.id,
      previousState: active ? JSON.stringify({ tokenId: active.id, revokedAt }) : null,
      newState: JSON.stringify({ registrationId: registration.id, expiresAt: issued.expiresAt }),
    } });
  });
  return issued.token;
}

export async function revokeCheckInToken(input: CheckInTokenMutation) {
  return withSerializableRetry(async (tx) => {
    const registration = await requireScopedRegistration(tx, input);
    const active = await tx.checkInToken.findFirst({ where: { registrationId: registration.id, revokedAt: null } });
    if (!active) return false;
    const revokedAt = new Date();
    const changed = await tx.checkInToken.updateMany({ where: { id: active.id, revokedAt: null }, data: { revokedAt } });
    if (changed.count !== 1) throw retryConflict();
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId,
      action: "checkin_token.revoked", entityType: "CheckInToken", entityId: active.id,
      previousState: JSON.stringify({ revokedAt: null }), newState: JSON.stringify({ revokedAt, registrationId: registration.id }),
    } });
    return true;
  });
}

// Resolves a scanned/entered QR token to its registration for the staff
// operator's authorized event. Returns null for any invalid, expired,
// revoked, cross-tenant, or cross-event token rather than distinguishing the
// reason, so a losing scan cannot be used to probe which case applies.
export async function resolveActiveCheckInToken(input: { token: string; organizationId: string; eventId: string }) {
  const tokenHash = hashCheckInToken(input.token);
  const record = await db.checkInToken.findUnique({ where: { tokenHash }, include: { registration: { select: { id: true, organizationId: true, eventId: true, status: true } } } });
  if (!record || !isCheckInTokenActive(record)) return null;
  try {
    assertCheckInTokenScope({ organizationId: input.organizationId, eventId: input.eventId }, record.registration);
  } catch {
    return null;
  }
  const usedAt = new Date();
  // Throttle last-use writes to a five-minute window, matching the host-token
  // portal pattern, so a burst of scans does not hammer the row with updates.
  await db.checkInToken.updateMany({
    where: { id: record.id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(usedAt.getTime() - 5 * 60 * 1000) } }] },
    data: { lastUsedAt: usedAt },
  });
  return { registrationId: record.registration.id };
}
