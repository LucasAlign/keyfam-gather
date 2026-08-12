import { MembershipRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.DEMO_USER_EMAIL ?? "admin@gather.local").toLowerCase();
  const organization = await prisma.organization.upsert({
    where: { id: "demo-organization" },
    update: {},
    create: { id: "demo-organization", name: "Key Families" },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Gather Admin" },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: MembershipRole.ORGANIZATION_ADMIN },
    create: { userId: user.id, organizationId: organization.id, role: MembershipRole.ORGANIZATION_ADMIN },
  });
}

main().finally(() => prisma.$disconnect());
