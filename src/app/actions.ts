"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventFormValues } from "@/lib/event-datetime";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { enforcePublicRateLimit } from "@/lib/public-rate-limit";
import { assertHostScope, createHostToken, guestRegistrationIssue, hashHostToken, isHostTokenActive } from "@/lib/host-access";
import { destinationSeatChange, seatingCapacityIssue } from "@/lib/seating";
import { walkInMatchIssue } from "@/lib/walk-in";
import { withSerializableRetry } from "@/lib/transactions";
import { resolvePerson } from "@/lib/person-resolution";
import { parseRegistrationAnswers } from "@/lib/registration-fields";
import { bulkTableSchema, eventSchema, groupSchema, hostGuestSchema, hostSchema, partySchema, registrationSchema, seatingMoveSchema, tableSchema, walkInSchema } from "@/lib/validation";

export type ActionState = { error?: string; success?: string; fields?: Record<string, string[]>; candidates?: Array<{ id: string; name: string }>; values?: Record<string, string> };

function entries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const parsed = eventSchema.safeParse(eventFormValues(formData));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };

  try {
    const { user } = await requireActor(organizationId, "event:create");
    const event = await db.$transaction(async (tx) => {
      const created = await tx.event.create({ data: { organizationId, ...parsed.data } });
      await tx.auditLog.create({ data: { organizationId, eventId: created.id, actorId: user.id, action: "event.created", entityType: "Event", entityId: created.id, newState: JSON.stringify(created) } });
      return created;
    });
    redirect(`/events/${event.id}`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "We couldn't create this event. Try again." };
  }
}

export async function registerPerson(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = registrationSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };

  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, registrationFields: { where: { isActive: true }, include: { options: true }, orderBy: { sortOrder: "asc" } } } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "registration:create", eventId);
    const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;

    const custom = parseRegistrationAnswers(event.registrationFields, formData, "ADMIN");
    if (!custom.success) return { error: "Review the custom registration details.", fields: custom.errors };
    const requestedPersonId = String(formData.get("personId") ?? "");
    const resolutionChoice = String(formData.get("resolutionChoice") ?? "");
    const initialResolution = await db.$transaction((tx) => resolvePerson(tx, event.organizationId, parsed.data));
    if (initialResolution.kind === "CONFLICT") throw new Error("The email and phone identify different people. An authorized administrator must correct or merge those records.");
    if (initialResolution.kind === "SUGGESTIONS" && !resolutionChoice) {
      await requireActor(event.organizationId, "person:resolve", eventId);
      const candidates = await db.person.findMany({ where: { id: { in: initialResolution.personIds }, organizationId: event.organizationId, mergedIntoPersonId: null }, select: { id: true, firstName: true, lastName: true } });
      return {
        error: "Possible existing people found. Compare the options and choose an explicit resolution.",
        candidates: candidates.map((candidate) => ({ id: candidate.id, name: `${candidate.firstName} ${candidate.lastName}` })),
        values: Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value)])),
      };
    }
    if (resolutionChoice) await requireActor(event.organizationId, "person:resolve", eventId);
    await withSerializableRetry(async (tx) => {
      const resolution = await resolvePerson(tx, event.organizationId, parsed.data);
      if (resolution.kind === "CONFLICT") throw new Error("The email and phone identify different people.");
      let existingPersonId = resolution.kind === "EXACT" ? resolution.personId : null;
      if (resolution.kind === "SUGGESTIONS") {
        if (resolutionChoice === "use-existing" && resolution.personIds.includes(requestedPersonId)) existingPersonId = requestedPersonId;
        else if (resolutionChoice !== "create-new") throw new Error("Choose an available person or explicitly create a new one.");
      }
      const person = existingPersonId ? await tx.person.findFirstOrThrow({ where: { id: existingPersonId, organizationId: event.organizationId, mergedIntoPersonId: null } }) : await tx.person.create({ data: {
        organizationId: event.organizationId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        emailNormalized,
        phone: parsed.data.phone || null,
        phoneNormalized,
      } });
      const existing = await tx.registration.findUnique({ where: { eventId_personId: { eventId, personId: person.id } } });
      if (existing?.status === "ACTIVE") throw new Error("This person is already registered for the event.");
      const registration = existing
        ? await tx.registration.update({ where: { id: existing.id }, data: { status: "ACTIVE", cancelledAt: null, supersededAt: null, supersededByRegistrationId: null } })
        : await tx.registration.create({ data: { organizationId: event.organizationId, eventId, personId: person.id } });
      for (const answer of custom.answers) await tx.registrationFieldAnswer.upsert({ where: { registrationId_fieldId: { registrationId: registration.id, fieldId: answer.fieldId } }, create: { organizationId: event.organizationId, eventId, registrationId: registration.id, ...answer }, update: { value: answer.value } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: existing ? "registration.reactivated" : "registration.created", entityType: "Registration", entityId: registration.id, previousState: existing ? JSON.stringify({ status: existing.status, cancelledAt: existing.cancelledAt }) : undefined, newState: JSON.stringify({ registration, personId: person.id, personReused: Boolean(existingPersonId), customAnswerCount: custom.answers.length }) } });
    });
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}?registered=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This person is already registered for the event." };
    return { error: error instanceof Error ? error.message : "We couldn't register this person. Try again." };
  }
}

export async function createGroup(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = groupSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the group details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "host:manage", eventId);
    await db.$transaction(async (tx) => {
      const group = await tx.group.create({ data: { organizationId: event.organizationId, eventId, ...parsed.data } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "group.created", entityType: "Group", entityId: group.id, newState: JSON.stringify(group) } });
    });
    revalidatePath(`/events/${eventId}/hosts/new`);
    redirect(`/events/${eventId}/hosts/new?groupCreated=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "A group with that name already exists for this event." };
    return { error: error instanceof Error ? error.message : "We couldn't create this group. Try again." };
  }
}

export async function createHost(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = hostSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the host details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "host:manage", eventId);
    const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    const access = createHostToken();
    await withSerializableRetry(async (tx) => {
      const matches = await tx.person.findMany({ where: { organizationId: event.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new Error("The email and phone match different people. Ask an administrator to resolve the records.");
      const person = matches[0] ?? await tx.person.create({ data: { organizationId: event.organizationId, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized, phone: parsed.data.phone || null, phoneNormalized } });
      const group = parsed.data.groupMode === "existing"
        ? await tx.group.findFirst({ where: { id: parsed.data.groupId, eventId, organizationId: event.organizationId } })
        : await tx.group.create({ data: { organizationId: event.organizationId, eventId, name: parsed.data.groupName!, capacity: parsed.data.capacity } });
      if (!group) throw new Error("That group is not available for this event.");
      const existingRegistration = await tx.registration.findUnique({ where: { eventId_personId: { eventId, personId: person.id } }, select: { id: true, status: true, cancelledAt: true } });
      const occupied = await tx.registration.count({ where: { groupId: group.id, eventId, organizationId: event.organizationId, status: "ACTIVE", ...(existingRegistration ? { id: { not: existingRegistration.id } } : {}) } });
      if (group.capacity !== null && occupied >= group.capacity) throw new Error("This group is already at capacity.");
      const hostRegistration = await tx.registration.upsert({ where: { eventId_personId: { eventId, personId: person.id } }, update: { groupId: group.id, status: "ACTIVE", cancelledAt: null }, create: { organizationId: event.organizationId, eventId, personId: person.id, groupId: group.id, source: "STAFF" } });
      if (existingRegistration?.status === "CANCELLED") await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "registration.reactivated_by_host_creation", entityType: "Registration", entityId: hostRegistration.id, previousState: JSON.stringify(existingRegistration), newState: JSON.stringify({ status: hostRegistration.status, cancelledAt: null, groupId: group.id }) } });
      const host = await tx.eventHost.create({ data: { organizationId: event.organizationId, eventId, personId: person.id, groupId: group.id } });
      await tx.hostAccessToken.create({ data: { eventHostId: host.id, tokenHash: access.tokenHash, expiresAt: access.expiresAt } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "host.created", entityType: "EventHost", entityId: host.id, newState: JSON.stringify({ personId: person.id, groupId: group.id, expiresAt: access.expiresAt }) } });
    });
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}/hosts/new?access=${encodeURIComponent(access.token)}`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This person is already a host, or the group name is already in use." };
    return { error: error instanceof Error ? error.message : "We couldn't create this host. Try again." };
  }
}

export async function registerHostGuest(_: ActionState, formData: FormData): Promise<ActionState> {
  const rawToken = String(formData.get("token") ?? "");
  const parsed = hostGuestSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };
  try {
    await enforcePublicRateLimit("host:guest:create", rawToken, { limit: 12 });
    const access = await db.hostAccessToken.findUnique({ where: { tokenHash: hashHostToken(rawToken) }, include: { eventHost: { include: { group: true } } } });
    if (!access || !isHostTokenActive(access)) return { error: "This host link is no longer valid. Ask event staff for a new link." };
    const { eventHost, eventHost: { group } } = access;
    try { assertHostScope(eventHost, group); } catch { return { error: "This host link is no longer valid. Ask event staff for a new link." }; }
    const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    await withSerializableRetry(async (tx) => {
      const freshAccess = await tx.hostAccessToken.findUnique({ where: { id: access.id } });
      if (!freshAccess || !isHostTokenActive(freshAccess)) throw new Error("This host link is no longer valid. Ask event staff for a new link.");
      const occupied = await tx.registration.count({ where: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, groupId: group.id, status: "ACTIVE" } });
      const matches = await tx.person.findMany({ where: { organizationId: eventHost.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new Error("Those contact details match different records. Ask event staff for help.");
      const person = matches[0] ?? await tx.person.create({ data: { organizationId: eventHost.organizationId, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized, phone: parsed.data.phone || null, phoneNormalized } });
      const existingRegistration = await tx.registration.findUnique({ where: { eventId_personId: { eventId: eventHost.eventId, personId: person.id } }, select: { id: true, status: true, cancelledAt: true } });
      const issue = guestRegistrationIssue({ alreadyRegistered: existingRegistration?.status === "ACTIVE", capacity: group.capacity, occupied });
      if (issue) throw new Error(issue);
      const registration = existingRegistration
        ? await tx.registration.update({ where: { id: existingRegistration.id }, data: { status: "ACTIVE", cancelledAt: null, groupId: group.id, tableId: null, partyId: null, source: "HOST" } })
        : await tx.registration.create({ data: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, personId: person.id, groupId: group.id, source: "HOST" } });
      await tx.hostAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: eventHost.organizationId, eventId: eventHost.eventId, eventHostId: eventHost.id, action: existingRegistration ? "registration.host_reactivated" : "registration.host_created", entityType: "Registration", entityId: registration.id, previousState: existingRegistration ? JSON.stringify(existingRegistration) : undefined, newState: JSON.stringify({ registration, personId: person.id, groupId: group.id, personReused: Boolean(matches[0]) }) } });
    });
    revalidatePath(`/host/${rawToken}`);
    redirect(`/host/${rawToken}?registered=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This person is already registered for the event." };
    return { error: error instanceof Error ? error.message : "We couldn't add this guest. Try again." };
  }
}

export async function createSeatingTable(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = tableSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the table details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "seating:manage", eventId);
    await db.$transaction(async (tx) => {
      const table = await tx.seatingTable.create({ data: { organizationId: event.organizationId, eventId, ...parsed.data } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "seating.table_created", entityType: "SeatingTable", entityId: table.id, newState: JSON.stringify(table) } });
    });
    revalidatePath(`/events/${eventId}/seating`);
    redirect(`/events/${eventId}/seating?tableCreated=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "A table with that name already exists for this event." };
    return { error: error instanceof Error ? error.message : "We couldn't create this table. Try again." };
  }
}

export async function createSeatingTables(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = bulkTableSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the Table range.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This Event no longer exists." };
    const { user } = await requireActor(event.organizationId, "seating:manage", eventId);
    const names = Array.from({ length: parsed.data.count }, (_, index) => parsed.data.namePattern.replaceAll("{n}", String(parsed.data.startingNumber + index)));
    if (new Set(names).size !== names.length) return { error: "The naming pattern produces duplicate Table names." };
    await db.$transaction(async (tx) => {
      const conflicts = await tx.seatingTable.findMany({ where: { eventId, name: { in: names } }, select: { name: true } });
      if (conflicts.length) throw new Error(`These Tables already exist: ${conflicts.map(({ name }) => name).join(", ")}.`);
      await tx.seatingTable.createMany({ data: names.map((name) => ({ organizationId: event.organizationId, eventId, name, capacity: parsed.data.capacity })) });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "seating.tables_bulk_created", entityType: "SeatingTable", entityId: eventId, newState: JSON.stringify({ names, capacity: parsed.data.capacity }) } });
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/seating`);
    return { success: `${names.length} Tables created.` };
  } catch (error) { return { error: error instanceof Error ? error.message : "We couldn't create the Tables." }; }
}

export async function createParty(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = partySchema.safeParse({ name: formData.get("name"), registrationIds: formData.getAll("registrationIds").map(String) });
  if (!parsed.success) return { error: "Review the party details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "seating:manage", eventId);
    await db.$transaction(async (tx) => {
      const registrations = await tx.registration.findMany({ where: { id: { in: parsed.data.registrationIds }, eventId, organizationId: event.organizationId, status: "ACTIVE" }, select: { id: true } });
      if (registrations.length !== new Set(parsed.data.registrationIds).size) throw new Error("One or more selected guests are not available for this event.");
      const party = await tx.party.create({ data: { organizationId: event.organizationId, eventId, name: parsed.data.name } });
      await tx.registration.updateMany({ where: { id: { in: registrations.map(({ id }) => id) }, eventId, organizationId: event.organizationId }, data: { partyId: party.id } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "seating.party_created", entityType: "Party", entityId: party.id, newState: JSON.stringify({ name: party.name, registrationIds: registrations.map(({ id }) => id) }) } });
    });
    revalidatePath(`/events/${eventId}/seating`);
    redirect(`/events/${eventId}/seating?partyCreated=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "A party with that name already exists for this event." };
    return { error: error instanceof Error ? error.message : "We couldn't create this party. Try again." };
  }
}

export async function moveSeating(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = seatingMoveSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Choose who to move and a destination." };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "seating:manage", eventId);
    await withSerializableRetry(async (tx) => {
      const table = parsed.data.tableId ? await tx.seatingTable.findFirst({ where: { id: parsed.data.tableId, eventId, organizationId: event.organizationId } }) : null;
      if (parsed.data.tableId && !table) throw new Error("That table is not available for this event.");
      const sourceWhere = parsed.data.sourceType === "registration" ? { id: parsed.data.sourceId } : parsed.data.sourceType === "group" ? { groupId: parsed.data.sourceId } : { partyId: parsed.data.sourceId };
      if (parsed.data.sourceType === "group" && !await tx.group.findFirst({ where: { id: parsed.data.sourceId, eventId, organizationId: event.organizationId }, select: { id: true } })) throw new Error("That group is not available for this event.");
      if (parsed.data.sourceType === "party" && !await tx.party.findFirst({ where: { id: parsed.data.sourceId, eventId, organizationId: event.organizationId }, select: { id: true } })) throw new Error("That party is not available for this event.");
      const registrations = await tx.registration.findMany({ where: { ...sourceWhere, eventId, organizationId: event.organizationId, status: "ACTIVE" }, select: { id: true, tableId: true } });
      if (registrations.length === 0) throw new Error("No registrants are available for that move.");
      if (table) {
        const occupied = await tx.registration.count({ where: { tableId: table.id, eventId, organizationId: event.organizationId, status: "ACTIVE" } });
        const addedSeats = destinationSeatChange(registrations.map(({ tableId }) => tableId), table.id);
        const issue = seatingCapacityIssue({ capacity: table.capacity, occupied, addedSeats, overrideCapacity: parsed.data.overrideCapacity });
        if (issue) throw new Error(issue);
      }
      await tx.registration.updateMany({ where: { id: { in: registrations.map(({ id }) => id) }, eventId, organizationId: event.organizationId }, data: { tableId: table?.id ?? null } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "seating.moved", entityType: parsed.data.sourceType === "registration" ? "Registration" : parsed.data.sourceType === "group" ? "Group" : "Party", entityId: parsed.data.sourceId, previousState: JSON.stringify(registrations), newState: JSON.stringify({ tableId: table?.id ?? null, registrationIds: registrations.map(({ id }) => id), capacityOverridden: parsed.data.overrideCapacity }) } });
    });
    revalidatePath(`/events/${eventId}/seating`);
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}/seating?moved=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "We couldn't update the seating assignment. Try again." };
  }
}

export async function addAndCheckInWalkIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = walkInSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the walk-in details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "walkin:manage", eventId);
    const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    const result = await withSerializableRetry(async (tx) => {
      const group = parsed.data.groupId ? await tx.group.findFirst({ where: { id: parsed.data.groupId, organizationId: event.organizationId, eventId } }) : null;
      const table = parsed.data.tableId ? await tx.seatingTable.findFirst({ where: { id: parsed.data.tableId, organizationId: event.organizationId, eventId } }) : null;
      if (parsed.data.groupId && !group) throw new Error("That group is not available for this event.");
      if (parsed.data.tableId && !table) throw new Error("That table is not available for this event.");
      if (group?.capacity !== null && group?.capacity !== undefined) {
        const occupied = await tx.registration.count({ where: { organizationId: event.organizationId, eventId, groupId: group.id, status: "ACTIVE" } });
        if (occupied >= group.capacity) throw new Error("That group is already at capacity.");
      }
      if (table) {
        const occupied = await tx.registration.count({ where: { organizationId: event.organizationId, eventId, tableId: table.id, status: "ACTIVE" } });
        const issue = seatingCapacityIssue({ capacity: table.capacity, occupied, addedSeats: 1, overrideCapacity: parsed.data.overrideCapacity });
        if (issue) throw new Error(issue);
      }
      const matches = emailNormalized || phoneNormalized ? await tx.person.findMany({ where: { organizationId: event.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []), ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } }) : [];
      const existingRegistration = matches.length === 1 ? await tx.registration.findUnique({ where: { eventId_personId: { eventId, personId: matches[0].id } }, select: { id: true, status: true, cancelledAt: true } }) : null;
      const matchIssue = walkInMatchIssue(matches.length, existingRegistration?.status === "ACTIVE");
      if (matchIssue) throw new Error(matchIssue);
      const person = matches[0] ?? await tx.person.create({ data: { organizationId: event.organizationId, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized, phone: parsed.data.phone || null, phoneNormalized } });
      const registration = existingRegistration
        ? await tx.registration.update({ where: { id: existingRegistration.id }, data: { status: "ACTIVE", cancelledAt: null, groupId: group?.id ?? null, tableId: table?.id ?? null, partyId: null, source: "WALK_IN" } })
        : await tx.registration.create({ data: { organizationId: event.organizationId, eventId, personId: person.id, groupId: group?.id ?? null, tableId: table?.id ?? null, source: "WALK_IN" } });
      const now = new Date();
      const checkIn = await tx.checkIn.upsert({ where: { registrationId: registration.id }, update: { actorId: user.id, deviceId: parsed.data.deviceId, checkedInAt: now, reversedAt: null, reversedById: null, version: { increment: 1 } }, create: { organizationId: event.organizationId, eventId, registrationId: registration.id, actorId: user.id, deviceId: parsed.data.deviceId } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: existingRegistration ? "walkin.reactivated_and_checked_in" : "walkin.created_and_checked_in", entityType: "Registration", entityId: registration.id, previousState: existingRegistration ? JSON.stringify(existingRegistration) : undefined, newState: JSON.stringify({ personId: person.id, personReused: Boolean(matches[0]), groupId: group?.id ?? null, tableId: table?.id ?? null, checkInId: checkIn.id, deviceId: parsed.data.deviceId, capacityOverridden: parsed.data.overrideCapacity }) } });
      return `${person.firstName} ${person.lastName}`;
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/check-in`);
    return { success: `${result} was added and checked in.` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This person is already registered. Find them in check-in instead." };
    return { error: error instanceof Error ? error.message : "We couldn't add this walk-in. Try again." };
  }
}
