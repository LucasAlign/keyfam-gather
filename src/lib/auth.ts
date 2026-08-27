import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { actorHasCapability, type Capability } from "@/lib/permissions";
import { SESSION_COOKIE, readSession, type SessionPayload } from "@/lib/session";

export class AuthorizationError extends Error {}

export function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET ?? process.env.DEMO_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new AuthorizationError("Authentication is not configured.");
  return secret;
}

async function currentSession(): Promise<SessionPayload> {
  const cookieStore = await cookies();
  const session = readSession(cookieStore.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!session) throw new AuthorizationError("Sign in to continue.");
  return session;
}

export async function getActorAccess(organizationId: string, eventId?: string) {
  const session = await currentSession();
  const user = await db.user.findUnique({
    where: { email: session.email },
    include: { memberships: true, eventAssignments: eventId ? { where: { eventId, organizationId } } : { where: { organizationId } } },
  });
  if (!user || user.sessionVersion !== session.version) throw new AuthorizationError("Sign in to continue.");
  const membership = user.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) {
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
  const session = await currentSession();
  const user = await db.user.findUnique({
    where: { email: session.email },
    include: { memberships: { include: { organization: true }, take: 1 } },
  });
  if (!user || user.sessionVersion !== session.version) throw new AuthorizationError("Sign in to continue.");
  const membership = user.memberships[0];
  if (!membership) throw new AuthorizationError("No organization is available for this account.");
  return membership.organization;
}
