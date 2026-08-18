import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetRateLimits } from "./rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit then rejects within the window", () => {
    const at = 1_000;
    expect(consumeRateLimit("a", 3, 60_000, at).allowed).toBe(true);
    expect(consumeRateLimit("a", 3, 60_000, at).allowed).toBe(true);
    expect(consumeRateLimit("a", 3, 60_000, at).allowed).toBe(true);
    const rejected = consumeRateLimit("a", 3, 60_000, at);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(60);
  });

  it("resets after the window elapses", () => {
    expect(consumeRateLimit("b", 1, 1_000, 0).allowed).toBe(true);
    expect(consumeRateLimit("b", 1, 1_000, 500).allowed).toBe(false);
    expect(consumeRateLimit("b", 1, 1_000, 1_000).allowed).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    expect(consumeRateLimit("x", 1, 1_000, 0).allowed).toBe(true);
    expect(consumeRateLimit("y", 1, 1_000, 0).allowed).toBe(true);
    expect(consumeRateLimit("x", 1, 1_000, 0).allowed).toBe(false);
  });
});
