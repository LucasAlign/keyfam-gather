import { db } from "@/lib/db";
import { roleHasCapability, type Capability } from "@/lib/permissions";

export class AuthorizationError extends Error {}

export async function requireActor(organizationId: string, capability: Capability) {
  const email = (process.env.DEMO_USER_EMAIL ?? "admin@gather.local").toLowerCase();
  const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
  const membership = user?.memberships.find((item) => item.organizationId === organizationId);
  if (!user || !membership || !roleHasCapability(membership.role, capability)) {
    throw new AuthorizationError("You do not have permission to do that.");
  }
  return { user, membership };
}

export async function getCurrentOrganization() {
  const email = (process.env.DEMO_USER_EMAIL ?? "admin@gather.local").toLowerCase();
  const membership = await db.membership.findFirst({ where: { user: { email } }, include: { organization: true } });
  if (!membership) throw new AuthorizationError("No organization is available for this account.");
  return membership.organization;
}
