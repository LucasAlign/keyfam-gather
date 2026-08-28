import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, deleteMany } = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn() }));

vi.mock("./db", () => ({ db: { publicRateLimit: { upsert, deleteMany } } }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));

import { enforcePublicRateLimit, rateLimitWindow } from "./public-rate-limit";

describe("public rate limit windows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("places requests into stable fixed windows", () => {
    expect(rateLimitWindow(new Date("2026-08-26T12:34:56.789Z"), 60).toISOString()).toBe("2026-08-26T12:34:00.000Z");
  });

  it("uses the Prisma model so configured PostgreSQL schemas are respected", async () => {
    upsert.mockResolvedValueOnce({ count: 1 });

    await expect(enforcePublicRateLimit("login", "demo", { limit: 10, windowSeconds: 300 })).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key_windowStart: expect.objectContaining({ key: expect.any(String), windowStart: expect.any(Date) }) },
      update: { count: { increment: 1 }, expiresAt: expect.any(Date) },
      select: { count: true },
    }));
  });
});
