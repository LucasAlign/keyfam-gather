import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";

export class PublicRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) { super("Too many attempts. Wait a moment and try again."); }
}

export function rateLimitWindow(now: Date, windowSeconds: number) {
  return new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function enforcePublicRateLimit(scope: string, bearerToken: string, options: { limit?: number; windowSeconds?: number } = {}) {
  const limit = options.limit ?? 30;
  const windowSeconds = options.windowSeconds ?? 60;
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  const key = `${scope}:${digest(bearerToken)}:${digest(client)}`;
  const windowStart = rateLimitWindow(new Date(), windowSeconds);
  const expiresAt = new Date(windowStart.getTime() + windowSeconds * 2000);
  const row = await db.publicRateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1, expiresAt },
    update: { count: { increment: 1 }, expiresAt },
    select: { count: true },
  });
  if (Math.random() < 0.01) void db.publicRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  if (row.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
    throw new PublicRateLimitError(retryAfterSeconds);
  }
}
