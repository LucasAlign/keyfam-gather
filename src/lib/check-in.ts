export const CHECK_IN_UNDO_WINDOW_MS = 15 * 60 * 1000;

export function normalizeCheckInSearch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesCheckInSearch(searchText: string, query: string) {
  const terms = normalizeCheckInSearch(query).split(" ").filter(Boolean);
  const haystack = normalizeCheckInSearch(searchText);
  return terms.every((term) => haystack.includes(term));
}

export function canUndoCheckIn(checkedInAt: Date, reversedAt: Date | null, now = new Date()) {
  return reversedAt === null && now.getTime() - checkedInAt.getTime() <= CHECK_IN_UNDO_WINDOW_MS;
}
