import { EventRole, MembershipRole, PrismaClient, RegistrationSource, type User } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

export const PLAYGROUND_EVENT_ID = "playground-fundraising-gala";
export const PLAYGROUND_ADMIN_EMAIL = "playground-admin@gather.local";
export const PLAYGROUND_PASSWORD = "Gather-Playground-2026!";
export const PLAYGROUND_ATTENDEE_COUNT = 260;
export const PLAYGROUND_VOLUNTEER_COUNT = 5;

const FIRST_NAMES = [
  "Avery", "Jordan", "Morgan", "Taylor", "Riley", "Cameron", "Casey", "Parker", "Quinn", "Reese",
  "Drew", "Hayden", "Jamie", "Kendall", "Logan", "Micah", "Payton", "Rowan", "Sage", "Skyler",
];
const LAST_NAMES = [
  "Adams", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Harris", "Iverson", "Johnson",
  "Kim", "Lewis", "Mitchell", "Nguyen", "Owens", "Patel", "Reed", "Sullivan", "Turner", "Williams",
];

export async function seedPlaygroundData(prisma: PrismaClient, organizationId: string) {
  const passwordHash = hashPassword(PLAYGROUND_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: PLAYGROUND_ADMIN_EMAIL },
    update: { name: "Playground Admin", passwordHash },
    create: { email: PLAYGROUND_ADMIN_EMAIL, name: "Playground Admin", passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId } },
    update: { role: MembershipRole.ORGANIZATION_ADMIN },
    create: { userId: admin.id, organizationId, role: MembershipRole.ORGANIZATION_ADMIN },
  });

  await prisma.event.upsert({
    where: { id: PLAYGROUND_EVENT_ID },
    update: {
      name: "Gather Playground Gala",
      status: "REGISTRATION_OPEN",
      capacity: 300,
      attendanceGoal: 275,
      fundraisingGoalCents: 100_000_00,
    },
    create: {
      id: PLAYGROUND_EVENT_ID,
      organizationId,
      name: "Gather Playground Gala",
      description: "A fully populated sandbox event for trying registration, seating, check-in, volunteers, and reporting.",
      eventType: "Fundraising gala",
      status: "REGISTRATION_OPEN",
      startsAt: new Date("2027-11-06T22:00:00.000Z"),
      endsAt: new Date("2027-11-07T02:00:00.000Z"),
      timezone: "America/New_York",
      venue: "Riverside Convention Center",
      address: "100 Riverfront Drive, Charlotte, NC 28202",
      capacity: 300,
      registrationOpensAt: new Date("2027-05-01T12:00:00.000Z"),
      registrationClosesAt: new Date("2027-11-05T23:59:00.000Z"),
      isPublic: true,
      contactEmail: PLAYGROUND_ADMIN_EMAIL,
      contactName: "Playground Admin",
      attendanceGoal: 275,
      fundraisingGoalCents: 100_000_00,
    },
  });

  const volunteers: User[] = [];
  for (let index = 1; index <= PLAYGROUND_VOLUNTEER_COUNT; index += 1) {
    const email = `volunteer${index}@gather.local`;
    const volunteer = await prisma.user.upsert({
      where: { email },
      update: { name: `Volunteer ${index}`, passwordHash },
      create: { email, name: `Volunteer ${index}`, passwordHash },
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: volunteer.id, organizationId } },
      update: { role: MembershipRole.MEMBER },
      create: { userId: volunteer.id, organizationId, role: MembershipRole.MEMBER },
    });
    await prisma.eventAssignment.upsert({
      where: { userId_eventId: { userId: volunteer.id, eventId: PLAYGROUND_EVENT_ID } },
      update: { role: EventRole.VOLUNTEER },
      create: { userId: volunteer.id, organizationId, eventId: PLAYGROUND_EVENT_ID, role: EventRole.VOLUNTEER },
    });
    volunteers.push(volunteer);
  }

  await prisma.seatingTable.createMany({
    data: Array.from({ length: 26 }, (_, index) => ({
      id: `playground-table-${String(index + 1).padStart(2, "0")}`,
      organizationId,
      eventId: PLAYGROUND_EVENT_ID,
      name: `Table ${index + 1}`,
      capacity: 10,
      notes: index < 3 ? "Sponsor seating" : undefined,
    })),
    skipDuplicates: true,
  });
  await prisma.group.createMany({
    data: Array.from({ length: 26 }, (_, index) => ({
      id: `playground-group-${String(index + 1).padStart(2, "0")}`,
      organizationId,
      eventId: PLAYGROUND_EVENT_ID,
      name: index < 3 ? `Sponsor Group ${index + 1}` : `Community Group ${index - 2}`,
      capacity: 10,
    })),
    skipDuplicates: true,
  });

  await prisma.person.createMany({
    data: Array.from({ length: PLAYGROUND_ATTENDEE_COUNT }, (_, index) => {
      const sequence = index + 1;
      const email = `guest${String(sequence).padStart(3, "0")}@example.test`;
      return {
        id: `playground-person-${String(sequence).padStart(3, "0")}`,
        organizationId,
        firstName: FIRST_NAMES[index % FIRST_NAMES.length],
        lastName: `${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]} ${sequence}`,
        email,
        emailNormalized: email,
        phone: `+1 704 555 ${String(1000 + sequence).slice(-4)}`,
        phoneNormalized: `+1704555${String(1000 + sequence).slice(-4)}`,
        city: "Charlotte",
        region: "NC",
        postalCode: "28202",
        country: "US",
        communicationOptOut: sequence % 29 === 0,
      };
    }),
    skipDuplicates: true,
  });
  await prisma.registration.createMany({
    data: Array.from({ length: PLAYGROUND_ATTENDEE_COUNT }, (_, index) => {
      const sequence = index + 1;
      const suffix = String(sequence).padStart(3, "0");
      const cluster = String(Math.floor(index / 10) + 1).padStart(2, "0");
      return {
        id: `playground-registration-${suffix}`,
        organizationId,
        eventId: PLAYGROUND_EVENT_ID,
        personId: `playground-person-${suffix}`,
        groupId: `playground-group-${cluster}`,
        tableId: `playground-table-${cluster}`,
        source: sequence % 13 === 0 ? RegistrationSource.WALK_IN : sequence % 4 === 0 ? RegistrationSource.HOST : RegistrationSource.PUBLIC,
        registeredAt: new Date(Date.UTC(2027, 4, 1 + (index % 150), 14, index % 60)),
      };
    }),
    skipDuplicates: true,
  });

  await prisma.checkIn.createMany({
    data: Array.from({ length: 140 }, (_, index) => ({
      id: `playground-checkin-${String(index + 1).padStart(3, "0")}`,
      organizationId,
      eventId: PLAYGROUND_EVENT_ID,
      registrationId: `playground-registration-${String(index + 1).padStart(3, "0")}`,
      actorId: volunteers[index % volunteers.length].id,
      deviceId: `playground-device-${(index % PLAYGROUND_VOLUNTEER_COUNT) + 1}`,
      checkedInAt: new Date(Date.UTC(2027, 10, 6, 21, 15 + (index % 75))),
    })),
    skipDuplicates: true,
  });

  return { admin, volunteers };
}
