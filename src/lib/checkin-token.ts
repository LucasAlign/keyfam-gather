import { createHash, randomBytes } from "node:crypto";

export const CHECKIN_TOKEN_BYTES = 32;

export function hashCheckInToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createCheckInToken(expiresAt: Date | null = null) {
  const token = randomBytes(CHECKIN_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashCheckInToken(token), expiresAt };
}

export function isCheckInTokenActive(token: { expiresAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  if (token.revokedAt !== null) return false;
  if (token.expiresAt !== null && token.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function assertCheckInTokenScope(
  scope: { organizationId: string; eventId: string },
  registration: { organizationId: string; eventId: string; status: string },
) {
  if (registration.organizationId !== scope.organizationId || registration.eventId !== scope.eventId) {
    throw new Error("This QR code cannot be used for this event.");
  }
  if (registration.status !== "ACTIVE") {
    throw new Error("This registration is not active.");
  }
}
