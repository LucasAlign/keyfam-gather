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

// Expand a bulk Table range into the exact list of names that would be created
// (issue #13). Shared by the server action and the client-side preview so the
// review a coordinator sees is exactly what gets written — no drift.
export function bulkTableNames(input: { count: number; startingNumber: number; namePattern: string }): string[] {
  if (!Number.isFinite(input.count) || input.count < 1) return [];
  return Array.from({ length: Math.floor(input.count) }, (_, index) =>
    input.namePattern.replaceAll("{n}", String(input.startingNumber + index)),
  );
}

// The internal names that collide within a generated range (before checking the
// database), so both the action and the preview can flag an unusable pattern.
export function duplicateTableNames(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return [...dupes];
}
