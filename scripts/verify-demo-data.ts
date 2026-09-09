import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { ensureDemoWorkspace } from "../src/lib/demo-provision";
import { DEMO_ACCOUNT } from "../src/lib/demo-account";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient();
async function verify() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = await ensureDemoWorkspace(db);
    const event = await db.event.findUniqueOrThrow({ where: { id: DEMO_ACCOUNT.eventId }, include: { _count: { select: { registrations: true, seatingTables: true, checkIns: true } } } });
    assert.equal(event.organizationId, DEMO_ACCOUNT.organizationId);
    assert.equal(event._count.registrations, 260, "Demo must show 260 guests");
    assert.equal(event._count.seatingTables, 26);
    assert.equal(event._count.checkIns, 140);
    const membership = await db.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: user.id, organizationId: DEMO_ACCOUNT.organizationId } } });
    assert.equal(membership.role, "VIEWER");
  }
  console.info("PASS: demo has 260 guests, 26 tables, 140 check-ins; repeat provisioning adds no duplicates and retains read-only access.");
}
verify().finally(() => db.$disconnect());
