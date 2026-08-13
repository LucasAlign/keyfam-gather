import { EventRole, MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { actorHasCapability, eventRoleHasCapability, roleHasCapability } from "./permissions";

describe("Vertical 1 authorization boundaries", () => {
  it("allows event staff to register but not create events", () => {
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "registration:create")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "event:create")).toBe(false);
  });

  it("limits viewers to reading events", () => {
    expect(roleHasCapability(MembershipRole.VIEWER, "event:view")).toBe(true);
    expect(roleHasCapability(MembershipRole.VIEWER, "registration:create")).toBe(false);
  });
});

describe("Vertical 2 authorization boundaries", () => {
  it("allows admins, but not event staff or viewers, to manage hosts", () => {
    expect(roleHasCapability(MembershipRole.ORGANIZATION_ADMIN, "host:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_ADMIN, "host:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "host:manage")).toBe(false);
    expect(roleHasCapability(MembershipRole.VIEWER, "host:manage")).toBe(false);
  });
});

describe("Vertical 3 authorization boundaries", () => {
  it("allows event staff to manage seating but keeps viewers read-only", () => {
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "seating:manage")).toBe(true);
    expect(roleHasCapability(MembershipRole.VIEWER, "seating:manage")).toBe(false);
  });
});

describe("Vertical 4 authorization boundaries", () => {
  it("allows event staff to operate check-in but keeps viewers read-only", () => {
    expect(roleHasCapability(MembershipRole.ORGANIZATION_ADMIN, "checkin:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_ADMIN, "checkin:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "checkin:manage")).toBe(true);
    expect(roleHasCapability(MembershipRole.VIEWER, "checkin:manage")).toBe(false);
  });
});

describe("Vertical 5 authorization boundaries", () => {
  it("keeps walk-in exception controls away from basic event staff", () => {
    expect(roleHasCapability(MembershipRole.ORGANIZATION_ADMIN, "walkin:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_ADMIN, "walkin:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "walkin:manage")).toBe(false);
    expect(roleHasCapability(MembershipRole.VIEWER, "walkin:manage")).toBe(false);
  });
});

describe("Vertical 7 authorization boundaries", () => {
  it("restricts name-tag generation to event administrators", () => {
    expect(roleHasCapability(MembershipRole.ORGANIZATION_ADMIN, "nametag:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_ADMIN, "nametag:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "nametag:manage")).toBe(false);
  });
});

describe("Vertical 8 authorization boundaries", () => {
  it("restricts staff invitation management to event administrators", () => {
    expect(roleHasCapability(MembershipRole.ORGANIZATION_ADMIN, "invitation:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_ADMIN, "invitation:manage")).toBe(true);
    expect(eventRoleHasCapability(EventRole.EVENT_STAFF, "invitation:manage")).toBe(false);
    expect(roleHasCapability(MembershipRole.VIEWER, "invitation:manage")).toBe(false);
  });
});

describe("event-scoped assignments", () => {
  it("does not grant capabilities from legacy organization-wide event roles", () => {
    expect(roleHasCapability(MembershipRole.EVENT_ADMIN, "walkin:manage")).toBe(false);
    expect(roleHasCapability(MembershipRole.EVENT_STAFF, "checkin:manage")).toBe(false);
  });

  it("combines organization and assigned-event capabilities", () => {
    expect(actorHasCapability(MembershipRole.MEMBER, EventRole.EVENT_ADMIN, "walkin:manage")).toBe(true);
    expect(actorHasCapability(MembershipRole.MEMBER, EventRole.EVENT_STAFF, "walkin:manage")).toBe(false);
    expect(actorHasCapability(MembershipRole.ORGANIZATION_ADMIN, null, "walkin:manage")).toBe(true);
  });
});
