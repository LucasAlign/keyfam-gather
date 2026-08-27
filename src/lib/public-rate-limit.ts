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
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "PublicRateLimit" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "PublicRateLimit"."count" + 1
    RETURNING "count"
  `;
  if (Math.random() < 0.01) void db.publicRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  if ((rows[0]?.count ?? limit + 1) > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
    throw new PublicRateLimitError(retryAfterSeconds);
  }
}
