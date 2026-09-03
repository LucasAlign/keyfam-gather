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

export type SubstituteGuestInput = {
  organizationId: string;
  eventId: string;
  registrationId: string;
  actorId: string;
  replacement: { existingPersonId?: string; firstName?: string; lastName?: string; email?: string; phone?: string };
  carryGroup: boolean;
  carryTable: boolean;
  carryParty: boolean;
  overrideCapacity: boolean;
};

// Replace the guest on an ACTIVE registration with another Person, carrying the
// chosen Group/Party/Table assignments and the Invitation, superseding the
// original (auditable) and reversing its check-in if present (issue #19).
export async function substituteGuest(input: SubstituteGuestInput) {
  return withSerializableRetry(async (tx) => {
    const original = await tx.registration.findFirst({
      where: { id: input.registrationId, organizationId: input.organizationId, eventId: input.eventId },
      include: { checkIn: true, invitation: true, table: { include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } }, person: { select: { firstName: true, lastName: true } } },
    });
    if (!original) throw new Error("That registration is not available here.");
    if (original.status !== "ACTIVE") throw new Error("Only an active registration can be substituted.");

    // Resolve the replacement Person: an explicit existing record, or a new one.
    let replacementPersonId: string;
    if (input.replacement.existingPersonId) {
      const person = await tx.person.findFirst({ where: { id: input.replacement.existingPersonId, organizationId: input.organizationId, mergedIntoPersonId: null }, select: { id: true } });
      if (!person) throw new Error("The selected replacement person is not available.");
      replacementPersonId = person.id;
    } else {
      const firstName = (input.replacement.firstName ?? "").trim();
      const lastName = (input.replacement.lastName ?? "").trim();
      if (!firstName || !lastName) throw new Error("Enter the replacement guest's first and last name.");
      const emailNormalized = input.replacement.email ? normalizeEmail(input.replacement.email) : null;
      const phoneNormalized = input.replacement.phone ? normalizePhone(input.replacement.phone) : null;
      const clash = await tx.person.findFirst({ where: { organizationId: input.organizationId, mergedIntoPersonId: null, OR: [...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : [])] }, select: { id: true } });
      if (clash) throw new Error("Those contact details already belong to someone — pick the existing person instead.");
      const created = await tx.person.create({ data: { organizationId: input.organizationId, firstName, lastName, email: input.replacement.email || null, emailNormalized, phone: input.replacement.phone || null, phoneNormalized } });
      replacementPersonId = created.id;
    }
    if (replacementPersonId === original.personId) throw new Error("Choose a different person than the current guest.");

    const groupId = input.carryGroup ? original.groupId : null;
    const partyId = input.carryParty ? original.partyId : null;
    const tableId = input.carryTable ? original.tableId : null;

    // Capacity check excludes the original's own seat, which is being vacated.
    if (tableId && original.table) {
      const occupied = Math.max(original.table._count.registrations - 1, 0);
      if (occupied + 1 > original.table.capacity && !input.overrideCapacity) {
        throw new Error(`Table ${original.table.name} is at capacity. Choose the override to seat the replacement.`);
      }
    }

    const now = new Date();
    // Reverse the original guest's check-in if they were marked arrived.
    if (original.checkIn?.reversedAt === null) {
      const changed = await tx.checkIn.updateMany({ where: { id: original.checkIn.id, version: original.checkIn.version, reversedAt: null }, data: { reversedAt: now, reversedById: input.actorId, version: { increment: 1 } } });
      if (changed.count !== 1) throw new Prisma.PrismaClientKnownRequestError("Attendance state changed", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
    }

    // Create or reactivate the replacement's registration (one row per person/event).
    const existingForReplacement = await tx.registration.findUnique({ where: { eventId_personId: { eventId: input.eventId, personId: replacementPersonId } } });
    if (existingForReplacement?.status === "ACTIVE") throw new Error("The replacement person is already registered for this event.");
    const replacement = existingForReplacement
      ? await tx.registration.update({ where: { id: existingForReplacement.id }, data: { status: "ACTIVE", cancelledAt: null, supersededAt: null, supersededByRegistrationId: null, source: "STAFF", groupId, partyId, tableId } })
      : await tx.registration.create({ data: { organizationId: input.organizationId, eventId: input.eventId, personId: replacementPersonId, source: "STAFF", groupId, partyId, tableId } });

    // Supersede the original, pointing at its replacement.
    const supersededOriginal = await tx.registration.update({ where: { id: original.id }, data: { status: "SUPERSEDED", supersededAt: now, supersededByRegistrationId: replacement.id } });

    // Carry the invitation across to the new registration and guest.
    let invitationTransferred = false;
    if (original.invitation) {
      await tx.invitation.update({ where: { id: original.invitation.id }, data: { registrationId: replacement.id, inviteeId: replacementPersonId } });
      invitationTransferred = true;
    }

    await tx.auditLog.create({ data: {
      organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId,
      action: "registration.substituted", entityType: "Registration", entityId: replacement.id,
      previousState: JSON.stringify({ registrationId: original.id, personId: original.personId, status: original.status, groupId: original.groupId, partyId: original.partyId, tableId: original.tableId }),
      newState: JSON.stringify({ registrationId: replacement.id, personId: replacementPersonId, carried: { groupId, partyId, tableId }, invitationTransferred, supersededRegistrationId: supersededOriginal.id, overrideCapacity: input.overrideCapacity }),
    } });

    return { replacementRegistrationId: replacement.id, supersededRegistrationId: supersededOriginal.id, invitationTransferred };
  });
}
