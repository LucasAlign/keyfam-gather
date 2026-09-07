import { db } from "@/lib/db";
import { proposeSeating } from "@/lib/seating-proposals";

export async function getSeatingProposals(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, registrations: { where: { status: "ACTIVE" }, select: { id: true, tableId: true, partyId: true, groupId: true, person: { select: { firstName: true, lastName: true } }, party: { select: { name: true } }, group: { select: { name: true } }, fieldAnswers: { select: { value: true, field: { select: { key: true, label: true } } } } } }, seatingTables: { select: { id: true, name: true, capacity: true, registrations: { where: { status: "ACTIVE" }, select: { groupId: true } } }, orderBy: { name: "asc" } } } });
  if (!event) throw new Error("This Event no longer exists.");
  const accessibility = (answers: Array<{ value: unknown; field: { key: string; label: string } }>) => answers.some((answer) => /accessib|mobility|wheelchair|accommodation/i.test(`${answer.field.key} ${answer.field.label}`) && ![null, false, "", "no", "false"].includes(answer.value as never));
  const result = proposeSeating(event.registrations.filter(({ tableId }) => !tableId).map((item) => ({ id: item.id, name: `${item.person.firstName} ${item.person.lastName}`, partyId: item.partyId, partyName: item.party?.name ?? null, groupId: item.groupId, groupName: item.group?.name ?? null, accessibilitySensitive: accessibility(item.fieldAnswers) })), event.seatingTables.map((table) => ({ id: table.id, name: table.name, capacity: table.capacity, occupied: table.registrations.length, groupCounts: table.registrations.reduce<Record<string, number>>((counts, registration) => { if (registration.groupId) counts[registration.groupId] = (counts[registration.groupId] ?? 0) + 1; return counts; }, {}) })));
  return { event: { id: event.id, organizationId: event.organizationId }, ...result };
}
