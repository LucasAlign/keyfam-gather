import { createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_SESSION_COOKIE = "gather_demo_session";

function signature(email: string, secret: string) {
  return createHmac("sha256", secret).update(email).digest("base64url");
}

export function createDemoSession(email: string, secret: string) {
  const normalized = email.trim().toLowerCase();
  return `${Buffer.from(normalized).toString("base64url")}.${signature(normalized, secret)}`;
}

export function readDemoSession(value: string | undefined, secret: string) {
  if (!value || !secret) return null;
  const [encodedEmail, suppliedSignature, extra] = value.split(".");
  if (!encodedEmail || !suppliedSignature || extra) return null;
  try {
    const email = Buffer.from(encodedEmail, "base64url").toString("utf8").trim().toLowerCase();
    const expected = Buffer.from(signature(email, secret));
    const supplied = Buffer.from(suppliedSignature);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? email : null;
  } catch {
    return null;
  }
}

export function credentialsMatch(supplied: string, expected: string) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
