import { describe, expect, it } from "vitest";
import { publicRegistrationAvailability } from "./public-registration-availability";

const now = new Date("2026-09-08T12:00:00Z");
describe("public registration availability", () => {
  it("allows an open Event inside its registration window", () => expect(publicRegistrationAvailability({ isPublic: true, status: "REGISTRATION_OPEN", registrationOpensAt: new Date("2026-09-01T00:00:00Z"), registrationClosesAt: new Date("2026-09-30T00:00:00Z") }, now).available).toBe(true));
  it.each(["DRAFT", "REGISTRATION_CLOSED", "EVENT_LIVE", "COMPLETED", "ARCHIVED"])("hides the form for %s Events", (status) => expect(publicRegistrationAvailability({ isPublic: true, status, registrationOpensAt: null, registrationClosesAt: null }, now).available).toBe(false));
  it("hides the form outside the configured window", () => {
    expect(publicRegistrationAvailability({ isPublic: true, status: "REGISTRATION_OPEN", registrationOpensAt: new Date("2026-09-10T00:00:00Z"), registrationClosesAt: null }, now).available).toBe(false);
    expect(publicRegistrationAvailability({ isPublic: true, status: "REGISTRATION_OPEN", registrationOpensAt: null, registrationClosesAt: new Date("2026-09-01T00:00:00Z") }, now).available).toBe(false);
  });
});
