import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildEventReporting } from "@/lib/reporting";
import { displayFieldAnswer } from "@/lib/registration-fields";

export async function getEventReportWorkspace(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      registrations: { include: { person: true, group: true, table: true, party: true, checkIn: true, fieldAnswers: { include: { field: { include: { options: true } } } } }, orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }] },
      registrationFields: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      groups: { include: { hosts: { include: { person: true } }, registrations: { select: { id: true } } }, orderBy: { name: "asc" } },
      seatingTables: { include: { registrations: { select: { id: true } } }, orderBy: { name: "asc" } },
      eventHosts: { include: { person: true, group: true }, orderBy: { person: { lastName: "asc" } } },
      invitations: { include: { group: true, sender: true, eventHost: { include: { person: true } }, registration: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) return null;
  const access = await requireActor(event.organizationId, "event:view", event.id);
  const reportFields = event.registrationFields.filter((field) => field.visibility === "PUBLIC" || access.can("person:resolve"));
  const report = buildEventReporting({
    registrations: event.registrations.map((registration) => ({ id: registration.id, firstName: registration.person.firstName, lastName: registration.person.lastName, email: registration.person.email, phone: registration.person.phone, source: registration.source, status: registration.status, registeredAt: registration.registeredAt, cancelledAt: registration.cancelledAt, group: registration.group?.name ?? null, table: registration.table?.name ?? null, party: registration.party?.name ?? null, checkedInAt: registration.status === "ACTIVE" && registration.checkIn && !registration.checkIn.reversedAt ? registration.checkIn.checkedInAt : null, customAnswers: Object.fromEntries(registration.fieldAnswers.filter((answer) => reportFields.some((field) => field.id === answer.fieldId)).map((answer) => [answer.field.key, displayFieldAnswer(answer.field, answer.value)])) })),
    hosts: event.eventHosts.map((host) => ({ firstName: host.person.firstName, lastName: host.person.lastName, email: host.person.email, phone: host.person.phone, group: host.group.name })),
    groups: event.groups.map((group) => ({ name: group.name, capacity: group.capacity, registrationIds: group.registrations.map(({ id }) => id) })),
    tables: event.seatingTables.map((table) => ({ name: table.name, capacity: table.capacity, registrationIds: table.registrations.map(({ id }) => id) })),
    invitations: event.invitations.map((invitation) => ({ firstName: invitation.firstName, lastName: invitation.lastName, email: invitation.email, phone: invitation.phone, status: invitation.status, group: invitation.group?.name ?? null, sender: invitation.sender?.name ?? (invitation.eventHost ? `${invitation.eventHost.person.firstName} ${invitation.eventHost.person.lastName}` : "Unknown"), sentAt: invitation.sentAt, openedAt: invitation.openedAt, respondedAt: invitation.respondedAt, registered: Boolean(invitation.registration) })),
    customFields: reportFields.map(({ key, label }) => ({ key, label })),
  });
  return { event, access, report };
}
