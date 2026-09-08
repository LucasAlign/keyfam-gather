import { MembershipRole, type PrismaClient } from "@prisma/client";
import { hashPassword } from "./password";
import { DEMO_ACCOUNT } from "./demo-account";

// Provisions the read-only public demo workspace: organization, VIEWER user,
// membership, and a sample event. Idempotent (all upserts) so it is safe to
// call from the seed script and, on demand, from the demo sign-in action —
// which keeps the demo login working even in environments where the seed step
// never ran (for example a Replit dev workspace).
export async function ensureDemoWorkspace(client: Pick<PrismaClient, "organization" | "user" | "membership" | "event">) {
  const organization = await client.organization.upsert({
    where: { id: DEMO_ACCOUNT.organizationId },
    update: { name: DEMO_ACCOUNT.organizationName },
    create: { id: DEMO_ACCOUNT.organizationId, name: DEMO_ACCOUNT.organizationName },
  });
  const user = await client.user.upsert({
    where: { email: DEMO_ACCOUNT.email },
    update: { name: DEMO_ACCOUNT.name, passwordHash: hashPassword(DEMO_ACCOUNT.password) },
    create: { email: DEMO_ACCOUNT.email, name: DEMO_ACCOUNT.name, passwordHash: hashPassword(DEMO_ACCOUNT.password) },
  });
  await client.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: MembershipRole.VIEWER },
    create: { userId: user.id, organizationId: organization.id, role: MembershipRole.VIEWER },
  });
  await client.event.upsert({
    where: { id: DEMO_ACCOUNT.eventId },
    update: {},
    create: {
      id: DEMO_ACCOUNT.eventId,
      organizationId: organization.id,
      name: "Family Connection Night",
      description: "A read-only sample event for exploring Gather.",
      status: "REGISTRATION_OPEN",
      startsAt: new Date("2027-04-17T22:00:00.000Z"),
      endsAt: new Date("2027-04-18T01:00:00.000Z"),
      timezone: "America/New_York",
      venue: "Community Hall",
      capacity: 120,
    },
  });
  return user;
}
