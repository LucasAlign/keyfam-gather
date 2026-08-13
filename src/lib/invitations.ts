import { createHash, randomBytes } from "node:crypto";
import type { InvitationStatus } from "@prisma/client";

const RESPONSE_STATUSES: InvitationStatus[] = ["REGISTERED", "DECLINED", "CANCELLED", "NO_RESPONSE"];

export function createInvitationToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationCanOpen(status: InvitationStatus, expiresAt: Date, now = new Date()) {
  return !["DRAFT", "CANCELLED", "NO_RESPONSE"].includes(status) && expiresAt > now;
}

export function invitationCanRespond(status: InvitationStatus, expiresAt: Date, now = new Date()) {
  return invitationCanOpen(status, expiresAt, now) && !RESPONSE_STATUSES.includes(status);
}

export function openedStatus(status: InvitationStatus): InvitationStatus {
  return status === "SENT" ? "OPENED" : status;
}

export function invitationStatusLabel(status: InvitationStatus) {
  return status === "NO_RESPONSE" ? "No response" : status.charAt(0) + status.slice(1).toLowerCase();
}
