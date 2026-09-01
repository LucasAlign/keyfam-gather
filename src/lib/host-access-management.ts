import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDeliveryProvider, type DeliveryResult } from "@/lib/delivery";
import { createHostToken, isHostTokenActive } from "@/lib/host-access";
import { buildHostLinkMessage, maskRecipient, resolveHostDeliveryChannel } from "@/lib/host-link-delivery";
import { decryptToken, encryptToken } from "@/lib/token-cipher";
import { withSerializableRetry } from "@/lib/transactions";

type HostAccessMutation = { organizationId: string; eventId: string; tokenId: string; actorId: string };
type HostAccessIssue = { organizationId: string; eventId: string; eventHostId: string; actorId: string };

const INACTIVE_LINK = "This host link is inactive. Rotate to issue a new one.";
const LEGACY_LINK = "This link predates secure recovery. Rotate the link to get a shareable copy.";

async function activeRecoverableToken(input: HostAccessMutation) {
  const access = await db.hostAccessToken.findFirst({
    where: { id: input.tokenId, eventHost: { organizationId: input.organizationId, eventId: input.eventId } },
    include: { eventHost: { include: { person: { select: { firstName: true, email: true, phone: true } }, event: { select: { name: true } } } } },
  });
  if (!access) throw new Error("That host link is not available for this event.");
  if (!isHostTokenActive(access)) throw new Error(INACTIVE_LINK);
  if (!access.tokenCipher) throw new Error(LEGACY_LINK);
  return access;
}

// Decrypts and returns the current active host token so authorized staff can
// copy or open it again without rotating. Reads only — the audit records that
// a plaintext link was surfaced.
export async function recoverHostAccessToken(input: HostAccessMutation) {
  const access = await activeRecoverableToken(input);
  const token = decryptToken(access.tokenCipher!);
  await db.auditLog.create({ data: {
    organizationId: input.organizationId,
    eventId: input.eventId,
    actorId: input.actorId,
    action: "host.access_recovered",
    entityType: "HostAccessToken",
    entityId: access.id,
    newState: JSON.stringify({ eventHostId: access.eventHostId }),
  } });
  return { token, expiresAt: access.expiresAt };
}

// Resends the current active host link to the host's email or phone without
// changing the token. Best-effort delivery (a log provider by default); the
// attempt is always audited.
export async function resendHostAccessLink(input: HostAccessMutation & { origin: string | null }) {
  const access = await activeRecoverableToken(input);
  const { person, event } = access.eventHost;
  const channel = resolveHostDeliveryChannel(person);
  if (!channel) throw new Error("This host has no email or phone on file to resend to.");
  if (!input.origin) throw new Error("A public app origin is not configured, so the link can't be emailed. Copy it instead.");
  const recipient = channel === "EMAIL" ? person.email! : person.phone!;
  const token = decryptToken(access.tokenCipher!);
  const provider = getDeliveryProvider(channel);
  const message = buildHostLinkMessage({ eventName: event.name, firstName: person.firstName, link: `${input.origin}/host/${token}`, channel });

  let outcome: DeliveryResult;
  try {
    outcome = await provider.send({ channel, to: recipient, subject: message.subject, body: message.body });
  } catch (error) {
    outcome = { status: "FAILED", error: error instanceof Error ? error.message : "Delivery failed." };
  }
  await db.auditLog.create({ data: {
    organizationId: input.organizationId,
    eventId: input.eventId,
    actorId: input.actorId,
    action: outcome.status === "SENT" ? "host.access_resent" : "host.access_resend_failed",
    entityType: "HostAccessToken",
    entityId: access.id,
    newState: JSON.stringify({ eventHostId: access.eventHostId, channel, provider: provider.name, status: outcome.status }),
  } });
  if (outcome.status !== "SENT") throw new Error("We couldn't send the link right now. Copy it and share it manually instead.");
  return { channel, recipientMasked: maskRecipient(recipient) };
}

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
    const created = await tx.hostAccessToken.create({ data: { eventHostId: access.eventHost.id, tokenHash: replacement.tokenHash, tokenCipher: encryptToken(replacement.token), expiresAt: replacement.expiresAt } });
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
