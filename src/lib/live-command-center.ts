export type LiveGuestFact = { id: string; name: string; arrived: boolean; walkIn: boolean; tableId: string | null; vip: boolean; sponsorRepresentative: boolean };
export type LiveTableFact = { id: string; name: string; capacity: number; assigned: number };
export type SyncOperationFact = { deviceId: string; occurredAt: Date; disposition: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED" };

export function buildLiveBriefing(input: { guests: LiveGuestFact[]; tables: LiveTableFact[]; operations: SyncOperationFact[]; now?: Date }) {
  const now = input.now ?? new Date(); const arrived = input.guests.filter(({ arrived: value }) => value).length; const remaining = input.guests.length - arrived;
  const lastOperationAt = input.operations.reduce<Date | null>((latest, item) => !latest || item.occurredAt > latest ? item.occurredAt : latest, null); const staleMinutes = lastOperationAt ? Math.max(0, Math.floor((now.getTime() - lastOperationAt.getTime()) / 60_000)) : null;
  const devices = new Map<string, { lastSeenAt: Date; conflicts: number }>(); for (const item of input.operations) { const current = devices.get(item.deviceId); devices.set(item.deviceId, { lastSeenAt: !current || item.occurredAt > current.lastSeenAt ? item.occurredAt : current.lastSeenAt, conflicts: (current?.conflicts ?? 0) + (item.disposition === "CONFLICT" || item.disposition === "REJECTED" ? 1 : 0) }); }
  const missingPriority = input.guests.filter((guest) => !guest.arrived && (guest.vip || guest.sponsorRepresentative)); const tableIssues = input.tables.filter((table) => table.assigned > table.capacity);
  const alerts = [
    ...missingPriority.map((guest) => ({ urgency: "High", title: `${guest.name} has not arrived`, evidence: guest.sponsorRepresentative ? "Configured sponsor representative is still absent." : "Registration data identifies this guest as VIP.", response: "Confirm with the host or sponsor contact before changing the guest record." })),
    ...tableIssues.map((table) => ({ urgency: "High", title: `${table.name} is over capacity`, evidence: `${table.assigned} guests are assigned to ${table.capacity} seats.`, response: "Review approved seating moves before directing more guests to this Table." })),
    ...(input.guests.some((guest) => !guest.tableId) ? [{ urgency: "Medium", title: "Guests remain unassigned", evidence: `${input.guests.filter((guest) => !guest.tableId).length} active guests have no Table.`, response: "Use the seating assistant or assign a Table during missing-guest resolution." }] : []),
    ...([...devices].some(([, device]) => device.conflicts) ? [{ urgency: "High", title: "Check-in sync needs attention", evidence: `${[...devices].reduce((sum, [, device]) => sum + device.conflicts, 0)} rejected or conflicting operation(s) are present in recent server history.`, response: "Open check-in on the affected device and resolve its queued conflicts." }] : []),
  ];
  return { metrics: { arrived, remaining, walkIns: input.guests.filter(({ walkIn }) => walkIn).length, unassignedGuests: input.guests.filter((guest) => !guest.tableId).length, tableIssues: tableIssues.length }, missingPriority, devices: [...devices].map(([deviceId, value]) => ({ deviceId, ...value })).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()), lastOperationAt, staleMinutes, alerts };
}
