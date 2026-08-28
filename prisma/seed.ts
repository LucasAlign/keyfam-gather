import { existsSync } from "node:fs";
import { MembershipRole, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEMO_ACCOUNT } from "../src/lib/demo-account";

// Load .env when present so `npm run db:seed` works without the Prisma CLI's
// auto-loading. In CI, environment variables are provided directly and no .env
// exists, so this is skipped.
if (existsSync(".env")) process.loadEnvFile(".env");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? process.env.DEMO_USER_EMAIL ?? "admin@gather.local").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Gather Admin";
  const organizationName = process.env.SEED_ORGANIZATION_NAME ?? "Key Families";
  const password = process.env.SEED_ADMIN_PASSWORD ?? process.env.DEMO_AUTH_PASSWORD;
  const passwordHash = password ? hashPassword(password) : undefined;

  const organization = await prisma.organization.upsert({
    where: { id: "demo-organization" },
    update: {},
    create: { id: "demo-organization", name: organizationName },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: passwordHash ? { name, passwordHash } : { name },
    create: { email, name, passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: MembershipRole.ORGANIZATION_ADMIN },
    create: { userId: user.id, organizationId: organization.id, role: MembershipRole.ORGANIZATION_ADMIN },
  });

  const demoOrganization = await prisma.organization.upsert({
    where: { id: DEMO_ACCOUNT.organizationId },
    update: { name: DEMO_ACCOUNT.organizationName },
    create: { id: DEMO_ACCOUNT.organizationId, name: DEMO_ACCOUNT.organizationName },
  });
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_ACCOUNT.email },
    update: { name: DEMO_ACCOUNT.name, passwordHash: hashPassword(DEMO_ACCOUNT.password) },
    create: {
      email: DEMO_ACCOUNT.email,
      name: DEMO_ACCOUNT.name,
      passwordHash: hashPassword(DEMO_ACCOUNT.password),
    },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: demoUser.id, organizationId: demoOrganization.id } },
    update: { role: MembershipRole.VIEWER },
    create: { userId: demoUser.id, organizationId: demoOrganization.id, role: MembershipRole.VIEWER },
  });
  await prisma.event.upsert({
    where: { id: DEMO_ACCOUNT.eventId },
    update: {},
    create: {
      id: DEMO_ACCOUNT.eventId,
      organizationId: demoOrganization.id,
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

  if (!passwordHash) {
    console.warn("Seed admin has no password. Set SEED_ADMIN_PASSWORD and re-run to enable sign-in.");
  }
}

main().finally(() => prisma.$disconnect());
