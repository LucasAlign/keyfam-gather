import { Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { withSerializableRetry } from "@/lib/transactions";

type LifecycleActor = { actorId?: string; eventHostId?: string };
type RegistrationScope = {
  organizationId: string;
  eventId: string;
  registrationId: string;
  groupId?: string;
  excludedPersonId?: string;
};

function scopedWhere(input: RegistrationScope) {
  return {
    id: input.registrationId,
    organizationId: input.organizationId,
    eventId: input.eventId,
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.excludedPersonId ? { personId: { not: input.excludedPersonId } } : {}),
  };
}

function auditActor(actor: LifecycleActor) {
  if (!actor.actorId && !actor.eventHostId) throw new Error("A lifecycle actor is required.");
  if (actor.actorId) return { actorId: actor.actorId };
  return { eventHostId: actor.eventHostId! };
}

export async function cancelRegistration(input: RegistrationScope & LifecycleActor) {
  const actor = auditActor(input);
  return withSerializableRetry(async (tx) => {
    const registration = await tx.registration.findFirst({
      where: scopedWhere(input),
      include: { checkIn: true, person: { select: { firstName: true, lastName: true } } },
    });
    if (!registration) throw new Error("That registration is not available here.");
    if (registration.status === "CANCELLED") return { changed: false, registration };

    const cancelledAt = new Date();
    if (registration.checkIn?.reversedAt === null) {
      const changed = await tx.checkIn.updateMany({
        where: { id: registration.checkIn.id, version: registration.checkIn.version, reversedAt: null },
        data: { reversedAt: cancelledAt, reversedById: input.actorId ?? null, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Prisma.PrismaClientKnownRequestError("Attendance state changed", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
      await tx.auditLog.create({ data: {
        organizationId: input.organizationId, eventId: input.eventId, ...actor,
        action: "checkin.reversed_by_registration_cancellation", entityType: "CheckIn", entityId: registration.checkIn.id,
        previousState: JSON.stringify({ reversedAt: null, version: registration.checkIn.version }),
        newState: JSON.stringify({ reversedAt: cancelledAt, version: registration.checkIn.version + 1 }),
      } });
    }

    const updated = await tx.registration.update({ where: { id: registration.id }, data: { status: "CANCELLED", cancelledAt } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, ...actor,
      action: "registration.cancelled", entityType: "Registration", entityId: registration.id,
      previousState: JSON.stringify({ status: registration.status, cancelledAt: registration.cancelledAt, groupId: registration.groupId, tableId: registration.tableId, partyId: registration.partyId }),
      newState: JSON.stringify({ status: updated.status, cancelledAt: updated.cancelledAt }),
    } });
    return { changed: true, registration: updated };
  });
}

export async function reactivateRegistration(input: RegistrationScope & LifecycleActor) {
  const actor = auditActor(input);
  return withSerializableRetry(async (tx) => {
    const registration = await tx.registration.findFirst({ where: scopedWhere(input), include: { group: true, table: true } });
    if (!registration) throw new Error("That registration is not available here.");
    if (registration.status === "ACTIVE") return { changed: false, registration };

    if (registration.group?.capacity !== null && registration.group?.capacity !== undefined) {
      const occupied = await tx.registration.count({ where: { organizationId: input.organizationId, eventId: input.eventId, groupId: registration.groupId, status: "ACTIVE" } });
      if (occupied >= registration.group.capacity) throw new Error("That group is at capacity. Move or cancel another registration first.");
    }
    if (registration.table) {
      const occupied = await tx.registration.count({ where: { organizationId: input.organizationId, eventId: input.eventId, tableId: registration.tableId, status: "ACTIVE" } });
      if (occupied >= registration.table.capacity) throw new Error("That table is at capacity. Change the seating assignment before restoring this registration.");
    }

    const updated = await tx.registration.update({ where: { id: registration.id }, data: { status: "ACTIVE", cancelledAt: null } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, ...actor,
      action: "registration.reactivated", entityType: "Registration", entityId: registration.id,
      previousState: JSON.stringify({ status: registration.status, cancelledAt: registration.cancelledAt }),
      newState: JSON.stringify({ status: updated.status, cancelledAt: null, groupId: updated.groupId, tableId: updated.tableId, partyId: updated.partyId }),
    } });
    return { changed: true, registration: updated };
  });
}

export async function updateRegistrationPerson(input: RegistrationScope & LifecycleActor & {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  restrictSharedPerson?: boolean;
}) {
  const actor = auditActor(input);
  const emailNormalized = input.email ? normalizeEmail(input.email) : null;
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
  return withSerializableRetry(async (tx) => {
    const registration = await tx.registration.findFirst({ where: scopedWhere(input), include: { person: true } });
    if (!registration) throw new Error("That registration is not available here.");

    if (input.restrictSharedPerson) {
      const [otherRegistrations, hostRoles, invitations] = await Promise.all([
        tx.registration.count({ where: { personId: registration.personId, id: { not: registration.id } } }),
        tx.eventHost.count({ where: { personId: registration.personId } }),
        tx.invitation.count({ where: { inviteeId: registration.personId } }),
      ]);
      if (otherRegistrations || hostRoles || invitations) throw new Error("This person is used elsewhere. Ask an organization administrator to update the canonical record.");
    }

    const contactOwner = await tx.person.findFirst({ where: {
      organizationId: input.organizationId,
      id: { not: registration.personId },
      OR: [...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : [])],
    }, select: { id: true } });
    if (contactOwner) throw new Error("Those contact details belong to another person. Ask an administrator to resolve the records.");

    const previous = registration.person;
    const person = await tx.person.update({ where: { id: registration.personId }, data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email || null,
      emailNormalized,
      phone: input.phone || null,
      phoneNormalized,
    } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, ...actor,
      action: "registration.person_updated", entityType: "Registration", entityId: registration.id,
      previousState: JSON.stringify({ personId: previous.id, firstName: previous.firstName, lastName: previous.lastName, email: previous.email, phone: previous.phone }),
      newState: JSON.stringify({ personId: person.id, firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone }),
    } });
    return person;
  });
}
