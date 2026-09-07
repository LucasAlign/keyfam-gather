import { EventRole, MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { actorHasCapability, assignableEventRoles, eventRoleHasCapability, eventRoleLabels } from "./permissions";

describe("event-night staffing roles (issue #18)", () => {
  it("gives a Volunteer only search/check-in/undo, not lead-only actions", () => {
    expect(eventRoleHasCapability(EventRole.VOLUNTEER, "checkin:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.VOLUNTEER, "event:view")).toBe(true);
    for (const capability of ["walkin:manage", "seating:manage", "registration:manage", "person:resolve"] as const) {
      expect(eventRoleHasCapability(EventRole.VOLUNTEER, capability)).toBe(false);
    }
  });

  it("gives a Check-in Lead walk-ins, corrections, moves, overrides, and escalations", () => {
    for (const capability of ["checkin:manage", "walkin:manage", "seating:manage", "registration:manage", "person:resolve"] as const) {
      expect(eventRoleHasCapability(EventRole.CHECKIN_LEAD, capability)).toBe(true);
    }
    // A lead runs the event floor but does not configure the event or manage hosts.
    expect(eventRoleHasCapability(EventRole.CHECKIN_LEAD, "event:manage")).toBe(false);
    expect(eventRoleHasCapability(EventRole.CHECKIN_LEAD, "host:manage")).toBe(false);
  });

  it("resolves an actor's capability from the event role when the org role grants nothing", () => {
    // A member with no org capabilities, assigned as a Volunteer at the event.
    expect(actorHasCapability(MembershipRole.MEMBER, EventRole.VOLUNTEER, "checkin:manage")).toBe(true);
    expect(actorHasCapability(MembershipRole.MEMBER, EventRole.VOLUNTEER, "walkin:manage")).toBe(false);
    // The same member assigned as a lead can run walk-ins.
    expect(actorHasCapability(MembershipRole.MEMBER, EventRole.CHECKIN_LEAD, "walkin:manage")).toBe(true);
  });

  it("exposes every assignable role with a friendly label", () => {
    expect(assignableEventRoles).toContain(EventRole.VOLUNTEER);
    expect(assignableEventRoles).toContain(EventRole.CHECKIN_LEAD);
    for (const role of assignableEventRoles) expect(eventRoleLabels[role]).toBeTruthy();
  });
});
