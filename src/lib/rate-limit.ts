// In-process fixed-window rate limiter. It protects a single server instance and
// is intentionally dependency-free. A distributed store (e.g. Redis) should back
// this seam before running multiple instances behind a load balancer; callers use
// the same `consumeRateLimit` contract regardless of the backing store.

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

function prune(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) prune(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// Test-only reset so suites do not leak window state between cases.
export function resetRateLimits() {
  windows.clear();
}
