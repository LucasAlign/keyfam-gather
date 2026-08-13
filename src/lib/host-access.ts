import { createHash, randomBytes } from "node:crypto";

export const HOST_TOKEN_BYTES = 32;
export const HOST_TOKEN_TTL_DAYS = 30;

export function hashHostToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createHostToken(now = new Date()) {
  const token = randomBytes(HOST_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + HOST_TOKEN_TTL_DAYS);
  return { token, tokenHash: hashHostToken(token), expiresAt };
}

export function isHostTokenActive(token: { expiresAt: Date; revokedAt: Date | null }, now = new Date()) {
  return token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}

export function remainingSeats(capacity: number | null, occupied: number) {
  return capacity === null ? null : Math.max(capacity - occupied, 0);
}

export function guestRegistrationIssue(input: { alreadyRegistered: boolean; capacity: number | null; occupied: number }) {
  if (input.alreadyRegistered) return "This person is already registered for the event.";
  if (input.capacity !== null && input.occupied >= input.capacity) return "Your group is full. Contact event staff if you need another seat.";
  return null;
}

export function assertHostScope(host: { organizationId: string; eventId: string; groupId: string }, group: { organizationId: string; eventId: string; id: string }) {
  if (host.organizationId !== group.organizationId || host.eventId !== group.eventId || host.groupId !== group.id) {
    throw new Error("This host access cannot view or change that group.");
  }
}
