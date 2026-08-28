import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, logError } = vi.hoisted(() => ({ findUnique: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
vi.mock("@/lib/rate-limit-request", () => ({
  enforceIpRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: logError },
  serializeError: (error: Error) => ({ message: error.message }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { login } from "./actions";

describe("login dependency failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-session-secret-that-is-longer-than-32-characters";
  });

  it("returns a useful retry message instead of triggering the application error boundary", async () => {
    findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    const formData = new FormData();
    formData.set("email", "demo@gather.app");
    formData.set("password", "gather2026");

    await expect(login({}, formData)).resolves.toEqual({
      error: "Sign-in is temporarily unavailable. Please try again shortly.",
    });
    expect(logError).toHaveBeenCalledWith("Login dependency failure", { message: "database unavailable" });
  });
});
