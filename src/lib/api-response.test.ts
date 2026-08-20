import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, mapError, ok } from "./api-response";
import { ApiError } from "./invitation-service";

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("invitation API response mapping", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns success payloads with the given status and no-store", async () => {
    const response = ok({ invitation: { id: "inv_1" } }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(bodyOf(response)).resolves.toEqual({ invitation: { id: "inv_1" } });
  });

  it("maps an ApiError onto its status and message", async () => {
    const response = mapError(new ApiError(409, "This invitation was already answered."));
    expect(response.status).toBe(409);
    await expect(bodyOf(response)).resolves.toEqual({ error: "This invitation was already answered." });
  });

  it("carries validation field errors through on a 400", async () => {
    const response = mapError(new ApiError(400, "Review the invitation details.", { email: ["Enter a valid email address."] }));
    expect(response.status).toBe(400);
    await expect(bodyOf(response)).resolves.toEqual({
      error: "Review the invitation details.",
      fields: { email: ["Enter a valid email address."] },
    });
  });

  it("hides unexpected errors behind a 500 without leaking internals", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = mapError(new Error("connection refused at 10.0.0.5:5432"));
    expect(response.status).toBe(500);
    const body = await bodyOf(response);
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("omits the fields key when there are no field errors", async () => {
    await expect(bodyOf(fail(403, "You do not have permission to do that."))).resolves.toEqual({
      error: "You do not have permission to do that.",
    });
  });
});
