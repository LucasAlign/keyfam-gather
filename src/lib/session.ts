import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "gather_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type SessionPayload = { email: string; version: number };

function signature(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

// A session cookie is an HMAC-signed, base64url-encoded payload carrying the
// actor's email and their current session version. Bumping the stored session
// version on a user invalidates every previously issued cookie (used for
// sign-out-everywhere and password changes).
export function createSession(payload: SessionPayload, secret: string): string {
  const normalized: SessionPayload = { email: payload.email.trim().toLowerCase(), version: payload.version };
  const data = Buffer.from(JSON.stringify(normalized)).toString("base64url");
  return `${data}.${signature(data, secret)}`;
}

export function readSession(value: string | undefined, secret: string): SessionPayload | null {
  if (!value || !secret) return null;
  const [data, suppliedSignature, extra] = value.split(".");
  if (!data || !suppliedSignature || extra) return null;
  // Verify the signature before decoding or parsing untrusted payload bytes.
  const expected = Buffer.from(signature(data, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { email, version } = parsed as Record<string, unknown>;
    if (typeof email !== "string" || typeof version !== "number" || !Number.isInteger(version)) return null;
    return { email: email.trim().toLowerCase(), version };
  } catch {
    return null;
  }
}
