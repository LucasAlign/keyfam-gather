import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventStatus, MembershipRole } from "@prisma/client";
import { db } from "../src/lib/db";
import { duplicateEventConfiguration, transitionEvent, updateEventConfiguration } from "../src/lib/event-configuration";

const suffix = randomUUID();
const organizationId = `event-config-${suffix}`;

async function main() {
  const organization = await db.organization.create({ data: { id: organizationId, name: "Event configuration verification" } });
  try {
    const user = await db.user.create({ data: { email: `${suffix}@example.test`, name: "Verifier", memberships: { create: { organizationId: organization.id, role: MembershipRole.ORGANIZATION_ADMIN } } } });
    const source = await db.event.create({ data: {
      organizationId: organization.id,
      name: "Source banquet",
      description: "Annual gathering",
      eventType: "Fundraising dinner",
      startsAt: new Date("2027-05-01T22:00:00Z"),
      endsAt: new Date("2027-05-02T01:00:00Z"),
      timezone: "America/New_York",
      venue: "Community Hall",
      address: "100 Main Street",
      capacity: 500,
      isPublic: true,
      contactEmail: "events@example.test",
      brandingPrimaryColor: "#24594c",
      groups: { create: { organizationId: organization.id, name: "Community Hosts", capacity: 8 } },
      seatingTables: { create: { organizationId: organization.id, name: "Table 1", capacity: 10, notes: "Near stage" } },
    } });
    const person = await db.person.create({ data: { organizationId: organization.id, firstName: "Test", lastName: "Guest" } });
    const registration = await db.registration.create({ data: { organizationId: organization.id, eventId: source.id, personId: person.id } });
    await db.checkIn.create({ data: { organizationId: organization.id, eventId: source.id, registrationId: registration.id, actorId: user.id, deviceId: "verification" } });

    await updateEventConfiguration({ eventId: source.id, organizationId: organization.id, actorId: user.id, name: source.name, description: source.description ?? undefined, eventType: source.eventType, startsAt: source.startsAt, endsAt: source.endsAt, timezone: source.timezone, venue: source.venue ?? undefined, address: source.address ?? undefined, capacity: source.capacity ?? undefined, isPublic: source.isPublic, contactName: "Event Team", contactEmail: source.contactEmail ?? undefined, brandingPrimaryColor: source.brandingPrimaryColor });
    await transitionEvent({ eventId: source.id, organizationId: organization.id, actorId: user.id, status: EventStatus.REGISTRATION_OPEN });
    const duplicate = await duplicateEventConfiguration({ eventId: source.id, organizationId: organization.id, actorId: user.id, name: "Next year banquet", startsAt: new Date("2028-05-01T22:00:00Z"), endsAt: new Date("2028-05-02T01:00:00Z") });
    const copied = await db.event.findUniqueOrThrow({ where: { id: duplicate.id }, include: { groups: true, seatingTables: true, registrations: true, eventHosts: true, invitations: true, parties: true, checkIns: true, assignments: true } });
    assert.equal(copied.status, EventStatus.DRAFT);
    assert.equal(copied.contactName, "Event Team");
    assert.equal(copied.groups.length, 1);
    assert.equal(copied.seatingTables.length, 1);
    assert.equal(copied.registrations.length, 0);
    assert.equal(copied.eventHosts.length, 0);
    assert.equal(copied.invitations.length, 0);
    assert.equal(copied.parties.length, 0);
    assert.equal(copied.checkIns.length, 0);
    assert.equal(copied.assignments.length, 0);
    assert.equal(await db.auditLog.count({ where: { organizationId: organization.id, action: { in: ["event.configuration_updated", "event.status_changed", "event.duplicated"] } } }), 3);
    console.log("Event configuration PostgreSQL contract passed.");
  } finally {
    await db.organization.delete({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { email: `${suffix}@example.test` } });
  }
}

main().finally(() => db.$disconnect());
