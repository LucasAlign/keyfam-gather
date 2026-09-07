export type SeatingGuest = { id: string; name: string; partyId: string | null; partyName: string | null; groupId: string | null; groupName: string | null; accessibilitySensitive: boolean };
export type SeatingTableFact = { id: string; name: string; capacity: number; occupied: number; groupCounts: Record<string, number> };
export type SeatingProposal = { id: string; registrationIds: string[]; guestNames: string[]; tableId: string; tableName: string; seatsRequired: number; evidence: string[]; confidence: number };

export function proposeSeating(guests: SeatingGuest[], tables: SeatingTableFact[]) {
  const ambiguous: Array<{ guestNames: string[]; reason: string }> = [];
  const proposals: SeatingProposal[] = [];
  const remaining = new Map(tables.map((table) => [table.id, table.capacity - table.occupied]));
  const chunks = new Map<string, SeatingGuest[]>();
  for (const guest of guests) { const key = guest.partyId ? `party:${guest.partyId}` : `guest:${guest.id}`; chunks.set(key, [...(chunks.get(key) ?? []), guest]); }
  for (const [id, chunk] of [...chunks].sort((a, b) => b[1].length - a[1].length)) {
    const names = chunk.map(({ name }) => name);
    if (chunk.some(({ accessibilitySensitive }) => accessibilitySensitive)) { ambiguous.push({ guestNames: names, reason: "Accessibility information requires staff review before choosing a Table." }); continue; }
    const groupId = chunk.every((guest) => guest.groupId === chunk[0].groupId) ? chunk[0].groupId : null;
    const candidates = tables.filter((table) => (remaining.get(table.id) ?? 0) >= chunk.length).map((table) => ({ table, score: groupId ? table.groupCounts[groupId] ?? 0 : 0 })).sort((a, b) => b.score - a.score || a.table.name.localeCompare(b.table.name));
    if (!candidates.length) { ambiguous.push({ guestNames: names, reason: `No Table has ${chunk.length} open seat${chunk.length === 1 ? "" : "s"}.` }); continue; }
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) { ambiguous.push({ guestNames: names, reason: groupId ? "Several Tables have equally strong Group context." : "No Group or Party context identifies a safest Table." }); continue; }
    const winner = candidates[0]; remaining.set(winner.table.id, (remaining.get(winner.table.id) ?? 0) - chunk.length);
    proposals.push({ id, registrationIds: chunk.map(({ id: registrationId }) => registrationId), guestNames: names, tableId: winner.table.id, tableName: winner.table.name, seatsRequired: chunk.length, evidence: [chunk[0].partyName ? `Keeps ${chunk[0].partyName} together` : "Individual placement", groupId ? `${winner.score} member(s) of ${chunk[0].groupName} already at this Table` : "No Group preference", `${remaining.get(winner.table.id)} seats remain after placement`], confidence: groupId && winner.score > 0 ? 0.95 : 0.7 });
  }
  return { proposals, ambiguous };
}
