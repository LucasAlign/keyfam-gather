import { existsSync } from "node:fs";
import { MembershipRole, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

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

  if (!passwordHash) {
    console.warn("Seed admin has no password. Set SEED_ADMIN_PASSWORD and re-run to enable sign-in.");
  }
}

main().finally(() => prisma.$disconnect());
