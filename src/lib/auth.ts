import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { actorHasCapability, type Capability } from "@/lib/permissions";
import { DEMO_SESSION_COOKIE, readDemoSession } from "@/lib/demo-session";

export class AuthorizationError extends Error {}

async function authenticatedEmail() {
  const secret = process.env.DEMO_AUTH_SECRET;
  if (!secret) throw new AuthorizationError("Development authentication is not configured.");
  const cookieStore = await cookies();
  const email = readDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value, secret);
  if (!email) throw new AuthorizationError("Sign in to continue.");
  return email;
}

export async function getActorAccess(organizationId: string, eventId?: string) {
  const email = await authenticatedEmail();
  const user = await db.user.findUnique({
    where: { email },
    include: { memberships: true, eventAssignments: eventId ? { where: { eventId, organizationId } } : { where: { organizationId } } },
  });
  const membership = user?.memberships.find((item) => item.organizationId === organizationId);
  if (!user || !membership) {
    throw new AuthorizationError("You do not have permission to do that.");
  }
  const eventRole = eventId ? user.eventAssignments[0]?.role ?? null : null;
  return {
    user,
    membership,
    eventAssignments: user.eventAssignments,
    can: (capability: Capability) => actorHasCapability(membership.role, eventRole, capability),
  };
}

export async function requireActor(organizationId: string, capability: Capability, eventId?: string) {
  const access = await getActorAccess(organizationId, eventId);
  if (!access.can(capability)) throw new AuthorizationError("You do not have permission to do that.");
  return access;
}

export async function getCurrentOrganization() {
  const email = await authenticatedEmail();
  const membership = await db.membership.findFirst({ where: { user: { email } }, include: { organization: true } });
  if (!membership) throw new AuthorizationError("No organization is available for this account.");
  return membership.organization;
}
