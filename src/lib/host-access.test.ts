import { describe, expect, it } from "vitest";
import { assertHostScope, createHostToken, guestRegistrationIssue, hashHostToken, isHostTokenActive, remainingSeats } from "./host-access";

describe("host token security", () => {
  it("creates random bearer values and stores a deterministic digest", () => {
    const first = createHostToken(new Date("2026-08-12T00:00:00Z"));
    const second = createHostToken(new Date("2026-08-12T00:00:00Z"));
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashHostToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
  });

  it("rejects expired and revoked tokens", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    expect(isHostTokenActive({ expiresAt: new Date("2026-08-12T11:59:59Z"), revokedAt: null }, now)).toBe(false);
    expect(isHostTokenActive({ expiresAt: new Date("2026-08-13T00:00:00Z"), revokedAt: now }, now)).toBe(false);
    expect(isHostTokenActive({ expiresAt: new Date("2026-08-13T00:00:00Z"), revokedAt: null }, now)).toBe(true);
  });
});

describe("host and tenant isolation", () => {
  const scope = { organizationId: "org-a", eventId: "event-a", groupId: "group-a" };
  const group = { organizationId: "org-a", eventId: "event-a", id: "group-a" };
  it("rejects another tenant", () => expect(() => assertHostScope(scope, { ...group, organizationId: "org-b" })).toThrow());
  it("rejects another host group", () => expect(() => assertHostScope(scope, { ...group, id: "group-b" })).toThrow());
  it("rejects another event", () => expect(() => assertHostScope(scope, { ...group, eventId: "event-b" })).toThrow());
});

describe("guest registration policy", () => {
  it("protects duplicate registrations", () => expect(guestRegistrationIssue({ alreadyRegistered: true, capacity: 8, occupied: 2 })).toMatch(/already registered/));
  it("blocks a full group and permits the final available seat", () => {
    expect(guestRegistrationIssue({ alreadyRegistered: false, capacity: 8, occupied: 8 })).toMatch(/full/);
    expect(guestRegistrationIssue({ alreadyRegistered: false, capacity: 8, occupied: 7 })).toBeNull();
  });
  it("supports unlimited groups and clamps display remaining seats", () => {
    expect(guestRegistrationIssue({ alreadyRegistered: false, capacity: null, occupied: 500 })).toBeNull();
    expect(remainingSeats(null, 2)).toBeNull();
    expect(remainingSeats(2, 3)).toBe(0);
  });
});
