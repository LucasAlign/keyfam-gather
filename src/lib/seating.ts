export type SeatingScope = { organizationId: string; eventId: string };

export function assertSeatingScope(expected: SeatingScope, record: SeatingScope) {
  if (expected.organizationId !== record.organizationId || expected.eventId !== record.eventId) {
    throw new Error("That seating item is not available for this event.");
  }
}

export function destinationSeatChange(currentTableIds: Array<string | null>, destinationTableId: string | null) {
  if (destinationTableId === null) return 0;
  return currentTableIds.filter((tableId) => tableId !== destinationTableId).length;
}

export function seatingCapacityIssue(input: { capacity: number; occupied: number; addedSeats: number; overrideCapacity: boolean }) {
  const projected = input.occupied + input.addedSeats;
  if (projected > input.capacity && !input.overrideCapacity) {
    const overBy = projected - input.capacity;
    return `This move would put the table ${overBy} ${overBy === 1 ? "seat" : "seats"} over capacity. Select the override to continue.`;
  }
  return null;
}

export function tableCapacity(capacity: number, occupied: number) {
  return { remaining: Math.max(capacity - occupied, 0), overBy: Math.max(occupied - capacity, 0) };
}
