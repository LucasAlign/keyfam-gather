import { normalizeName } from "@/lib/person-resolution";

export type MissingGuestCandidate = { id: string; kind: "REGISTRATION" | "INVITATION" | "PERSON" | "GROUP" | "PARTY" | "TABLE"; label: string; detail: string; searchText: string; availableSeats?: number };

export function rankMissingGuestContexts(query: string, candidates: MissingGuestCandidate[]) {
  const wanted = normalizeName(query); if (wanted.length < 2) return [];
  const score = (candidate: MissingGuestCandidate) => { const text = normalizeName(candidate.searchText); const exact = text === wanted ? 100 : 0; const begins = text.startsWith(wanted) ? 60 : 0; const contains = text.includes(wanted) ? 35 : 0; const tokens = wanted.split(" ").filter((token) => text.includes(token)).length * 10; const priority = candidate.kind === "REGISTRATION" ? 120 : candidate.kind === "INVITATION" ? 40 : candidate.kind === "PERSON" ? 8 : 0; return exact + begins + contains + tokens + priority; };
  return candidates.map((candidate) => ({ ...candidate, score: score(candidate) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 20);
}
