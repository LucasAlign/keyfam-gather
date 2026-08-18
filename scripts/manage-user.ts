import { existsSync } from "node:fs";
import { MembershipRole, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

if (existsSync(".env")) process.loadEnvFile(".env");

// Minimal production provisioning: create or update a user, set their password,
// and grant an organization role. A full in-app user-management UI is a later
// enhancement; this covers admin/staff onboarding until then.
//
//   USER_PASSWORD=... npx tsx scripts/manage-user.ts <email> <name> <role> [organizationId]
//
// role is one of MembershipRole. organizationId defaults to the first organization.

const prisma = new PrismaClient();

async function main() {
  const [email, name, role, organizationIdArg] = process.argv.slice(2);
  const password = process.env.USER_PASSWORD;
  if (!email || !name || !role) {
    throw new Error("Usage: USER_PASSWORD=... tsx scripts/manage-user.ts <email> <name> <role> [organizationId]");
  }
  if (!(role in MembershipRole)) {
    throw new Error(`Invalid role "${role}". Expected one of: ${Object.keys(MembershipRole).join(", ")}`);
  }
  if (!password || password.length < 8) {
    throw new Error("Set USER_PASSWORD to at least 8 characters.");
  }

  const organizationId = organizationIdArg ?? (await prisma.organization.findFirst({ orderBy: { id: "asc" } }))?.id;
  if (!organizationId) throw new Error("No organization found. Seed an organization first.");

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name, passwordHash, sessionVersion: { increment: 1 } },
    create: { email: normalizedEmail, name, passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    update: { role: role as MembershipRole },
    create: { userId: user.id, organizationId, role: role as MembershipRole },
  });

  console.log(`Provisioned ${normalizedEmail} as ${role} in organization ${organizationId}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
