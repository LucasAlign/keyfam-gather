import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNameTags, type NameTagAudience, type NameTagRecord } from "@/lib/name-tags";

export async function getNameTagWorkspace(eventId: string, audience: NameTagAudience) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      organization: { select: { name: true } },
      groups: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      seatingTables: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      eventHosts: { select: { personId: true } },
      registrations: { include: { person: true, group: true, table: true, checkIn: true } },
    },
  });
  if (!event) return null;
  await requireActor(event.organizationId, "nametag:manage", event.id);
  const hostPersonIds = new Set(event.eventHosts.map((host) => host.personId));
  const records: NameTagRecord[] = event.registrations.map((registration) => ({
    registrationId: registration.id,
    firstName: registration.person.firstName,
    lastName: registration.person.lastName,
    table: registration.table?.name ?? null,
    group: registration.group?.name ?? null,
    organization: event.organization.name,
    role: hostPersonIds.has(registration.personId) ? "Host" : registration.source === "WALK_IN" ? "Walk-in" : "Guest",
    groupId: registration.groupId,
    tableId: registration.tableId,
    checkedIn: registration.checkIn?.reversedAt === null,
  }));
  return { event: { id: event.id, name: event.name }, groups: event.groups, tables: event.seatingTables, tags: createNameTags(records, audience) };
}
