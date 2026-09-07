"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { getSeatingProposals } from "@/lib/event-seating-proposals";
import { seatingCapacityIssue } from "@/lib/seating";
import { withSerializableRetry } from "@/lib/transactions";

export async function approveSeatingProposals(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? ""); const selected = new Set(formData.getAll("proposalIds").map(String));
  if (!eventId || !selected.size) throw new Error("Select at least one seating proposal.");
  const current = await getSeatingProposals(eventId); const chosen = current.proposals.filter(({ id }) => selected.has(id));
  if (chosen.length !== selected.size) throw new Error("Seating changed. Review the refreshed proposals.");
  const { user } = await requireActor(current.event.organizationId, "seating:manage", eventId);
  await withSerializableRetry(async (tx) => {
    for (const proposal of chosen) {
      const registrations = await tx.registration.findMany({ where: { id: { in: proposal.registrationIds }, eventId, organizationId: current.event.organizationId, status: "ACTIVE", tableId: null }, select: { id: true, tableId: true } });
      if (registrations.length !== proposal.registrationIds.length) throw new Error("A proposed guest was already moved. Review seating again.");
      const table = await tx.seatingTable.findFirst({ where: { id: proposal.tableId, eventId, organizationId: current.event.organizationId } }); if (!table) throw new Error("A proposed Table is no longer available.");
      const occupied = await tx.registration.count({ where: { tableId: table.id, eventId, organizationId: current.event.organizationId, status: "ACTIVE" } }); const issue = seatingCapacityIssue({ capacity: table.capacity, occupied, addedSeats: registrations.length, overrideCapacity: false }); if (issue) throw new Error(issue);
      await tx.registration.updateMany({ where: { id: { in: proposal.registrationIds }, eventId, organizationId: current.event.organizationId, status: "ACTIVE", tableId: null }, data: { tableId: table.id } });
      await tx.auditLog.create({ data: { organizationId: current.event.organizationId, eventId, actorId: user.id, action: "seating.proposal_approved", entityType: proposal.id.startsWith("party:") ? "Party" : "Registration", entityId: proposal.id.split(":")[1], previousState: JSON.stringify(registrations), newState: JSON.stringify({ tableId: table.id, registrationIds: proposal.registrationIds, evidence: proposal.evidence, confidence: proposal.confidence }) } });
    }
  });
  revalidatePath(`/events/${eventId}/seating`); revalidatePath(`/events/${eventId}`);
}
