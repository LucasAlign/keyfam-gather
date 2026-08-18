import { headers } from "next/headers";
import { consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";

// Derives a best-effort client identifier from proxy headers. Behind a trusted
// reverse proxy this is the real client IP; the leftmost x-forwarded-for entry is
// used, falling back to x-real-ip, then a shared bucket when neither is present.
export function clientIpFromHeaders(source: Headers): string {
  const forwarded = source.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return source.get("x-real-ip")?.trim() || "unknown";
}

export function consumeIpRateLimit(source: Headers, scope: string, limit: number, windowMs: number): RateLimitResult {
  return consumeRateLimit(`${scope}:${clientIpFromHeaders(source)}`, limit, windowMs);
}

export async function enforceIpRateLimit(scope: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return consumeIpRateLimit(await headers(), scope, limit, windowMs);
}
