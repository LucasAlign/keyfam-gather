import { EventRole, MembershipRole } from "@prisma/client";

export type Capability = "event:create" | "event:view" | "event:manage" | "registration:create" | "registration:manage" | "person:resolve" | "host:manage" | "seating:manage" | "checkin:manage" | "walkin:manage" | "nametag:manage" | "invitation:manage" | "fundraising:manage";

const organizationCapabilities: Record<MembershipRole, Capability[]> = {
  ORGANIZATION_ADMIN: ["event:create", "event:view", "event:manage", "registration:create", "registration:manage", "person:resolve", "host:manage", "seating:manage", "checkin:manage", "walkin:manage", "nametag:manage", "invitation:manage", "fundraising:manage"],
  EVENT_ADMIN: [],
  EVENT_STAFF: [],
  VIEWER: ["event:view"],
  MEMBER: [],
};

const eventCapabilities: Record<EventRole, Capability[]> = {
  EVENT_ADMIN: ["event:view", "event:manage", "registration:create", "registration:manage", "person:resolve", "host:manage", "seating:manage", "checkin:manage", "walkin:manage", "nametag:manage", "invitation:manage", "fundraising:manage"],
  EVENT_STAFF: ["event:view", "registration:create", "registration:manage", "seating:manage", "checkin:manage"],
  // Event-night check-in lead: can run walk-ins, correct registrations, move
  // seats/override capacity, and resolve probable-Person escalations (issue #18).
  CHECKIN_LEAD: ["event:view", "registration:create", "registration:manage", "person:resolve", "seating:manage", "checkin:manage", "walkin:manage"],
  // Basic volunteer station: search, check in, and undo only. No walk-ins,
  // seating changes, corrections, or escalations.
  VOLUNTEER: ["event:view", "checkin:manage"],
};

// Event roles a coordinator can assign, most privileged first, with the labels
// shown in staffing UI (issue #18).
export const assignableEventRoles: EventRole[] = [EventRole.EVENT_ADMIN, EventRole.EVENT_STAFF, EventRole.CHECKIN_LEAD, EventRole.VOLUNTEER];

export const eventRoleLabels: Record<EventRole, string> = {
  [EventRole.EVENT_ADMIN]: "Event admin",
  [EventRole.EVENT_STAFF]: "Event staff",
  [EventRole.CHECKIN_LEAD]: "Check-in lead",
  [EventRole.VOLUNTEER]: "Volunteer",
};

export const eventRoleSummaries: Record<EventRole, string> = {
  [EventRole.EVENT_ADMIN]: "Full control of this event, including configuration and hosts.",
  [EventRole.EVENT_STAFF]: "Manage registrations, seating, and check-in.",
  [EventRole.CHECKIN_LEAD]: "Check-in plus walk-ins, corrections, seat moves, overrides, and escalations.",
  [EventRole.VOLUNTEER]: "A focused check-in station: search, check in, and undo only.",
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
