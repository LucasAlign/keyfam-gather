import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { roleHasCapability } from "./permissions";

describe("Vertical 1 authorization boundaries", () => {
  it("allows event staff to register but not create events", () => {
    expect(roleHasCapability(MembershipRole.EVENT_STAFF, "registration:create")).toBe(true);
    expect(roleHasCapability(MembershipRole.EVENT_STAFF, "event:create")).toBe(false);
  });

  it("limits viewers to reading events", () => {
    expect(roleHasCapability(MembershipRole.VIEWER, "event:view")).toBe(true);
    expect(roleHasCapability(MembershipRole.VIEWER, "registration:create")).toBe(false);
  });
});
