import { describe, expect, it } from "vitest";
import { assertCheckInTokenScope, createCheckInToken, hashCheckInToken, isCheckInTokenActive } from "./checkin-token";

describe("check-in QR token security", () => {
  it("creates random bearer values and stores a deterministic digest", () => {
    const first = createCheckInToken();
    const second = createCheckInToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashCheckInToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.expiresAt).toBeNull();
  });

  it("never embeds a database ID inside the issued token", () => {
    const issued = createCheckInToken();
    expect(issued.token).not.toMatch(/^c[a-z0-9]{20,}$/i);
  });

  it("defaults to no expiry but honors an explicit one", () => {
    const expiresAt = new Date("2026-09-01T00:00:00Z");
    const issued = createCheckInToken(expiresAt);
    expect(issued.expiresAt).toBe(expiresAt);
  });

  it("rejects expired and revoked tokens, accepts an active no-expiry token", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    expect(isCheckInTokenActive({ expiresAt: new Date("2026-08-20T11:59:59Z"), revokedAt: null }, now)).toBe(false);
    expect(isCheckInTokenActive({ expiresAt: null, revokedAt: now }, now)).toBe(false);
    expect(isCheckInTokenActive({ expiresAt: null, revokedAt: null }, now)).toBe(true);
    expect(isCheckInTokenActive({ expiresAt: new Date("2026-08-21T00:00:00Z"), revokedAt: null }, now)).toBe(true);
  });
});

describe("check-in QR tenant and event isolation", () => {
  const scope = { organizationId: "org-a", eventId: "event-a" };
  const registration = { organizationId: "org-a", eventId: "event-a", status: "ACTIVE" };

  it("accepts a registration in scope", () => {
    expect(() => assertCheckInTokenScope(scope, registration)).not.toThrow();
  });

  it("rejects another tenant", () => {
    expect(() => assertCheckInTokenScope(scope, { ...registration, organizationId: "org-b" })).toThrow();
  });

  it("rejects another event", () => {
    expect(() => assertCheckInTokenScope(scope, { ...registration, eventId: "event-b" })).toThrow();
  });

  it("rejects a cancelled or superseded registration", () => {
    expect(() => assertCheckInTokenScope(scope, { ...registration, status: "CANCELLED" })).toThrow();
    expect(() => assertCheckInTokenScope(scope, { ...registration, status: "SUPERSEDED" })).toThrow();
  });
});
