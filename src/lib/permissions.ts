import { EventRole, MembershipRole } from "@prisma/client";

export type Capability = "event:create" | "event:view" | "event:manage" | "registration:create" | "registration:manage" | "person:resolve" | "host:manage" | "seating:manage" | "checkin:manage" | "walkin:manage" | "nametag:manage" | "invitation:manage";

const organizationCapabilities: Record<MembershipRole, Capability[]> = {
  ORGANIZATION_ADMIN: ["event:create", "event:view", "event:manage", "registration:create", "registration:manage", "person:resolve", "host:manage", "seating:manage", "checkin:manage", "walkin:manage", "nametag:manage", "invitation:manage"],
  EVENT_ADMIN: [],
  EVENT_STAFF: [],
  VIEWER: ["event:view"],
  MEMBER: [],
};

const eventCapabilities: Record<EventRole, Capability[]> = {
  EVENT_ADMIN: ["event:view", "event:manage", "registration:create", "registration:manage", "person:resolve", "host:manage", "seating:manage", "checkin:manage", "walkin:manage", "nametag:manage", "invitation:manage"],
  EVENT_STAFF: ["event:view", "registration:create", "registration:manage", "seating:manage", "checkin:manage"],
};

export function roleHasCapability(role: MembershipRole, capability: Capability) {
  return organizationCapabilities[role].includes(capability);
}

export function eventRoleHasCapability(role: EventRole, capability: Capability) {
  return eventCapabilities[role].includes(capability);
}

export function actorHasCapability(organizationRole: MembershipRole, eventRole: EventRole | null, capability: Capability) {
  return roleHasCapability(organizationRole, capability) || Boolean(eventRole && eventRoleHasCapability(eventRole, capability));
}
