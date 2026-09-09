import { MembershipRole, type PrismaClient } from "@prisma/client";
import { hashPassword } from "./password";
import { DEMO_ACCOUNT } from "./demo-account";

// Provisions the read-only public demo workspace: organization, VIEWER user,
// membership, and a sample event. Idempotent (all upserts) so it is safe to
// call from the seed script and, on demand, from the demo sign-in action —
// which keeps the demo login working even in environments where the seed step
// never ran (for example a Replit dev workspace).
export async function ensureDemoWorkspace(client: Pick<PrismaClient, "organization" | "user" | "membership" | "event" | "seatingTable" | "group" | "person" | "registration" | "checkIn">) {
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
    update: { capacity: 300 },
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
      capacity: 300,
    },
  });
  // Fixed IDs and skipDuplicates also repair older empty demos without
  // duplicating guests when visitors sign in repeatedly or concurrently.
  const scope = { organizationId: organization.id, eventId: DEMO_ACCOUNT.eventId };
  const fixtureId = (kind: string, index: number) => `public-demo-${kind}-${index + 1}`;
  await client.seatingTable.createMany({
    data: Array.from({ length: 26 }, (_, index) => ({ ...scope, id: fixtureId("table", index), name: `Table ${index + 1}`, capacity: 10 })),
    skipDuplicates: true,
  });
  await client.group.createMany({
    data: Array.from({ length: 26 }, (_, index) => ({ ...scope, id: fixtureId("group", index), name: index < 3 ? `Sponsor Group ${index + 1}` : `Community Group ${index - 2}`, capacity: 10 })),
    skipDuplicates: true,
  });
  const firstNames = ["Avery", "Jordan", "Morgan", "Taylor", "Riley", "Cameron", "Casey", "Parker", "Quinn", "Reese", "Drew", "Hayden", "Jamie", "Kendall", "Logan", "Micah", "Payton", "Rowan", "Sage", "Skyler"];
  const lastNames = ["Adams", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Harris", "Iverson", "Johnson", "Kim", "Lewis", "Mitchell"];
  await client.person.createMany({
    data: Array.from({ length: 260 }, (_, index) => ({
      id: fixtureId("person", index), organizationId: organization.id,
      firstName: firstNames[index % firstNames.length], lastName: lastNames[Math.floor(index / firstNames.length)],
      email: `demo-guest-${index + 1}@example.test`, emailNormalized: `demo-guest-${index + 1}@example.test`,
      communicationOptOut: true,
    })),
    skipDuplicates: true,
  });
  await client.registration.createMany({
    data: Array.from({ length: 260 }, (_, index) => ({
      ...scope, id: fixtureId("registration", index), personId: fixtureId("person", index),
      tableId: fixtureId("table", Math.floor(index / 10)), groupId: fixtureId("group", Math.floor(index / 10)),
      source: index % 13 === 0 ? "WALK_IN" : index % 4 === 0 ? "HOST" : "PUBLIC",
      registeredAt: new Date(Date.UTC(2027, 2, 1 + index % 28, 14, index % 60)),
    })),
    skipDuplicates: true,
  });
  await client.checkIn.createMany({
    data: Array.from({ length: 140 }, (_, index) => ({
      ...scope, id: fixtureId("checkin", index), registrationId: fixtureId("registration", index),
      actorId: user.id, deviceId: "public-demo-fixture",
      checkedInAt: new Date(Date.UTC(2027, 3, 17, 21, 30 + index % 60)),
    })),
    skipDuplicates: true,
  });
  return user;
}
