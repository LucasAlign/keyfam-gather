import { MembershipRole } from "@prisma/client";

export type Capability = "event:create" | "event:view" | "registration:create" | "host:manage" | "seating:manage" | "checkin:manage" | "walkin:manage";

const capabilities: Record<MembershipRole, Capability[]> = {
  ORGANIZATION_ADMIN: ["event:create", "event:view", "registration:create", "host:manage", "seating:manage", "checkin:manage", "walkin:manage"],
  EVENT_ADMIN: ["event:create", "event:view", "registration:create", "host:manage", "seating:manage", "checkin:manage", "walkin:manage"],
  EVENT_STAFF: ["event:view", "registration:create", "seating:manage", "checkin:manage"],
  VIEWER: ["event:view"],
};

export function roleHasCapability(role: MembershipRole, capability: Capability) {
  return capabilities[role].includes(capability);
}
