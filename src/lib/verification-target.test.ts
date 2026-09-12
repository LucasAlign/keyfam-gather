import { describe, expect, it, vi } from "vitest";
import { assertGatherVerificationTarget } from "./verification-target";

describe("assertGatherVerificationTarget", () => {
  it("rejects a different service before a load test writes fixtures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(assertGatherVerificationTarget("http://localhost:3000", fetcher)).rejects.toThrow(/GATHER_VERIFY_URL/);
  });

  it("accepts Gather only when both liveness and database readiness are healthy", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
      .mockResolvedValueOnce(Response.json({ status: "ready", database: "ok" }));
    await expect(assertGatherVerificationTarget("http://localhost:3000", fetcher)).resolves.toBeUndefined();
  });
});
