import { Prisma } from "@prisma/client";
import { createHostToken } from "@/lib/host-access";
import { withSerializableRetry } from "@/lib/transactions";

type HostAccessMutation = { organizationId: string; eventId: string; tokenId: string; actorId: string };
type HostAccessIssue = { organizationId: string; eventId: string; eventHostId: string; actorId: string };

const retryConflict = () => new Prisma.PrismaClientKnownRequestError("Host access changed", {
  code: "P2034",
  clientVersion: Prisma.prismaVersion.client,
});

export async function revokeHostAccessCredential(input: HostAccessMutation) {
  return withSerializableRetry(async (tx) => {
    const access = await tx.hostAccessToken.findFirst({
      where: { id: input.tokenId, eventHost: { organizationId: input.organizationId, eventId: input.eventId } },
      include: { eventHost: { select: { id: true } } },
    });
    if (!access) throw new Error("That host link is not available for this event.");
    if (access.revokedAt) return false;
    const revokedAt = new Date();
    const changed = await tx.hostAccessToken.updateMany({ where: { id: access.id, revokedAt: null }, data: { revokedAt } });
    if (changed.count !== 1) throw retryConflict();
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorId: input.actorId,
      action: "host.access_revoked",
      entityType: "HostAccessToken",
      entityId: access.id,
      previousState: JSON.stringify({ revokedAt: null, expiresAt: access.expiresAt }),
      newState: JSON.stringify({ revokedAt, eventHostId: access.eventHost.id }),
    } });
    return true;
  });
}

export async function rotateHostAccessCredential(input: HostAccessMutation) {
  const replacement = createHostToken();
  await withSerializableRetry(async (tx) => {
    const access = await tx.hostAccessToken.findFirst({
      where: { id: input.tokenId, eventHost: { organizationId: input.organizationId, eventId: input.eventId } },
      include: { eventHost: { select: { id: true } } },
    });
    if (!access) throw new Error("That host link is not available for this event.");
    const activeReplacement = await tx.hostAccessToken.findFirst({
      where: { eventHostId: access.eventHost.id, id: { not: access.id }, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (activeReplacement) throw new Error("This host already has a newer active link. Refresh before rotating again.");

    const revokedAt = access.revokedAt ?? new Date();
    if (!access.revokedAt) {
      const changed = await tx.hostAccessToken.updateMany({ where: { id: access.id, revokedAt: null }, data: { revokedAt } });
      if (changed.count !== 1) throw retryConflict();
    }
    const created = await tx.hostAccessToken.create({ data: { eventHostId: access.eventHost.id, tokenHash: replacement.tokenHash, expiresAt: replacement.expiresAt } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorId: input.actorId,
      action: "host.access_rotated",
      entityType: "HostAccessToken",
      entityId: created.id,
      previousState: JSON.stringify({ tokenId: access.id, revokedAt }),
      newState: JSON.stringify({ tokenId: created.id, eventHostId: access.eventHost.id, expiresAt: replacement.expiresAt }),
    } });
  });
  return replacement.token;
}

export async function issueAdditionalHostAccessCredential(input: HostAccessIssue) {
  const credential = createHostToken();
  await withSerializableRetry(async (tx) => {
    const host = await tx.eventHost.findFirst({
      where: { id: input.eventHostId, organizationId: input.organizationId, eventId: input.eventId },
      select: { id: true },
    });
    if (!host) throw new Error("That host is not available for this event.");

    const created = await tx.hostAccessToken.create({
      data: { eventHostId: host.id, tokenHash: credential.tokenHash, expiresAt: credential.expiresAt },
    });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorId: input.actorId,
      action: "host.access_issued",
      entityType: "HostAccessToken",
      entityId: created.id,
      newState: JSON.stringify({ eventHostId: host.id, expiresAt: credential.expiresAt, preservesExistingAccess: true }),
    } });
  });
  return credential.token;
}
