import { describe, expect, it } from "vitest";
import { rateLimitWindow } from "./public-rate-limit";

describe("public rate limit windows", () => {
  it("places requests into stable fixed windows", () => {
    expect(rateLimitWindow(new Date("2026-08-26T12:34:56.789Z"), 60).toISOString()).toBe("2026-08-26T12:34:00.000Z");
  });
});
