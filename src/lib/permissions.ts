import { MembershipRole } from "@prisma/client";

export type Capability = "event:create" | "event:view" | "registration:create";

const capabilities: Record<MembershipRole, Capability[]> = {
  ORGANIZATION_ADMIN: ["event:create", "event:view", "registration:create"],
  EVENT_ADMIN: ["event:create", "event:view", "registration:create"],
  EVENT_STAFF: ["event:view", "registration:create"],
  VIEWER: ["event:view"],
};

export function roleHasCapability(role: MembershipRole, capability: Capability) {
  return capabilities[role].includes(capability);
}
