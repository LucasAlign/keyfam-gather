import { afterEach, describe, expect, it, vi } from "vitest";

// Control the delivery recorder so the best-effort contract can be tested
// without a database. vi.hoisted keeps the mock fn available to the hoisted
// vi.mock factory.
const { recordInvitationDelivery } = vi.hoisted(() => ({ recordInvitationDelivery: vi.fn() }));
vi.mock("@/lib/invitation-delivery", () => ({ recordInvitationDelivery }));

import { deliverInvitationSafely, InvitationError } from "./invitation-core";
import { ApiError } from "./invitation-service";

afterEach(() => {
  vi.restoreAllMocks();
  recordInvitationDelivery.mockReset();
});

describe("InvitationError", () => {
  it("carries an HTTP status and optional field errors", () => {
    const error = new InvitationError(409, "conflict", { email: ["taken"] });
    expect(error.status).toBe(409);
    expect(error.fields).toEqual({ email: ["taken"] });
  });

  it("is the shared base of the HTTP adapter's ApiError, so one check maps both", () => {
    // api-response.mapError keys off `instanceof InvitationError`; an ApiError
    // raised by the service adapter must satisfy it too.
    expect(new ApiError(404, "missing")).toBeInstanceOf(InvitationError);
    expect(new InvitationError(404, "missing")).not.toBeInstanceOf(ApiError);
  });
});

describe("deliverInvitationSafely", () => {
  const input = { organizationId: "org", eventId: "evt", invitationId: "inv", firstName: "A", email: "a@example.test", phone: null, link: "https://x/invite/t", eventName: "Gala" };

  it("records the delivery on the happy path", async () => {
    recordInvitationDelivery.mockResolvedValueOnce({ id: "attempt" });
    await expect(deliverInvitationSafely(input)).resolves.toBeUndefined();
    expect(recordInvitationDelivery).toHaveBeenCalledWith(input);
  });

  it("never throws when recording fails — delivery is best-effort", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordInvitationDelivery.mockRejectedValueOnce(new Error("provider down"));
    await expect(deliverInvitationSafely(input)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
