import { EventStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const eventStatusOrder = [
  EventStatus.DRAFT,
  EventStatus.REGISTRATION_OPEN,
  EventStatus.REGISTRATION_CLOSED,
  EventStatus.EVENT_LIVE,
  EventStatus.COMPLETED,
  EventStatus.ARCHIVED,
] as const;

export function nextEventStatus(status: EventStatus) {
  const index = eventStatusOrder.indexOf(status);
  return index < 0 || index === eventStatusOrder.length - 1 ? null : eventStatusOrder[index + 1];
}

export function assertEventTransition(current: EventStatus, next: EventStatus) {
  if (nextEventStatus(current) !== next) throw new Error(`This event cannot move from ${current.replaceAll("_", " ")} to ${next.replaceAll("_", " ")}.`);
}

type EventConfiguration = {
  name: string;
  description?: string;
  eventType: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venue?: string;
  address?: string;
  capacity?: number;
  registrationOpensAt?: Date;
  registrationClosesAt?: Date;
  isPublic: boolean;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  brandingPrimaryColor: string;
  brandingLogoUrl?: string;
};

function writableConfiguration(input: EventConfiguration) {
  return {
    ...input,
    description: input.description || null,
    venue: input.venue || null,
    address: input.address || null,
    capacity: input.capacity ?? null,
    registrationOpensAt: input.registrationOpensAt ?? null,
    registrationClosesAt: input.registrationClosesAt ?? null,
    contactName: input.contactName || null,
    contactEmail: input.contactEmail || null,
    contactPhone: input.contactPhone || null,
    brandingLogoUrl: input.brandingLogoUrl || null,
  };
}

export async function updateEventConfiguration(input: EventConfiguration & { eventId: string; organizationId: string; actorId: string }) {
  return db.$transaction(async (tx) => {
    const previous = await tx.event.findFirst({ where: { id: input.eventId, organizationId: input.organizationId } });
    if (!previous) throw new Error("This event no longer exists.");
    if (previous.status === EventStatus.ARCHIVED) throw new Error("Archived events are read-only.");
    const { eventId, organizationId, actorId, ...configuration } = input;
    const updated = await tx.event.update({ where: { id: eventId }, data: writableConfiguration(configuration) });
    await tx.auditLog.create({ data: { organizationId, eventId, actorId, action: "event.configuration_updated", entityType: "Event", entityId: eventId, previousState: JSON.stringify(previous), newState: JSON.stringify(updated) } });
    return updated;
  });
}

export async function transitionEvent(input: { eventId: string; organizationId: string; actorId: string; status: EventStatus }) {
  return db.$transaction(async (tx) => {
    const previous = await tx.event.findFirst({ where: { id: input.eventId, organizationId: input.organizationId }, select: { status: true } });
    if (!previous) throw new Error("This event no longer exists.");
    assertEventTransition(previous.status, input.status);
    const updated = await tx.event.update({ where: { id: input.eventId }, data: { status: input.status } });
    await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId, action: "event.status_changed", entityType: "Event", entityId: input.eventId, previousState: JSON.stringify(previous), newState: JSON.stringify({ status: updated.status }) } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function duplicateEventConfiguration(input: { eventId: string; organizationId: string; actorId: string; name: string; startsAt: Date; endsAt: Date; registrationOpensAt?: Date; registrationClosesAt?: Date }) {
  return db.$transaction(async (tx) => {
    const source = await tx.event.findFirst({
      where: { id: input.eventId, organizationId: input.organizationId },
      include: { groups: { select: { name: true, capacity: true } }, seatingTables: { select: { name: true, capacity: true, notes: true } } },
    });
    if (!source) throw new Error("This event no longer exists.");
    const duplicate = await tx.event.create({ data: {
      organizationId: input.organizationId,
      name: input.name,
      description: source.description,
      eventType: source.eventType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: source.timezone,
      venue: source.venue,
      address: source.address,
      capacity: source.capacity,
      registrationOpensAt: input.registrationOpensAt ?? null,
      registrationClosesAt: input.registrationClosesAt ?? null,
      isPublic: source.isPublic,
      contactName: source.contactName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      brandingPrimaryColor: source.brandingPrimaryColor,
      brandingLogoUrl: source.brandingLogoUrl,
      groups: { create: source.groups.map((group) => ({ organizationId: input.organizationId, ...group })) },
      seatingTables: { create: source.seatingTables.map((table) => ({ organizationId: input.organizationId, ...table })) },
    } });
    await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: duplicate.id, actorId: input.actorId, action: "event.duplicated", entityType: "Event", entityId: duplicate.id, newState: JSON.stringify({ sourceEventId: source.id, copiedGroups: source.groups.length, copiedTables: source.seatingTables.length }) } });
    return duplicate;
  });
}
