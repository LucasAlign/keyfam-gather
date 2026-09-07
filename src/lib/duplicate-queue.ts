import { createHash } from "node:crypto";
import { normalizeName } from "@/lib/person-resolution";

export type DuplicatePersonFact = { id: string; firstName: string; lastName: string; email: string | null; emailNormalized: string | null; phone: string | null; phoneNormalized: string | null; updatedAt: Date; registrations: number; invitations: number; hosts: number; attendances: number };
export type DuplicatePair = { key: string; fingerprint: string; first: DuplicatePersonFact; second: DuplicatePersonFact; evidence: string[]; confidence: number; consequences: string[] };

export function probableDuplicatePairs(people: DuplicatePersonFact[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let left = 0; left < people.length; left += 1) for (let right = left + 1; right < people.length; right += 1) {
    const first = people[left]; const second = people[right]; const sameName = normalizeName(`${first.firstName} ${first.lastName}`) === normalizeName(`${second.firstName} ${second.lastName}`); const sameEmail = Boolean(first.emailNormalized && first.emailNormalized === second.emailNormalized); const samePhone = Boolean(first.phoneNormalized && first.phoneNormalized === second.phoneNormalized);
    if (!sameName && !sameEmail && !samePhone) continue; const evidence = [sameName && "Exact normalized name", sameEmail && "Matching email", samePhone && "Matching phone", sameName && first.emailNormalized && second.emailNormalized && first.emailNormalized !== second.emailNormalized && "Different emails", sameName && first.phoneNormalized && second.phoneNormalized && first.phoneNormalized !== second.phoneNormalized && "Different phones"].filter(Boolean) as string[];
    const ids = [first.id, second.id].sort(); const key = `person-pair:${ids.join(":")}`; const fingerprint = createHash("sha256").update(JSON.stringify(ids.map((id) => { const person = id === first.id ? first : second; return [id, person.firstName, person.lastName, person.emailNormalized, person.phoneNormalized, person.updatedAt.toISOString()]; }))).digest("hex"); const confidence = sameEmail && samePhone ? 1 : sameEmail || samePhone ? 0.95 : 0.65;
    pairs.push({ key, fingerprint, first, second, evidence, confidence, consequences: [`${first.registrations + second.registrations} Registration(s) reviewed`, `${first.invitations + second.invitations} Invitation(s) reassigned`, `${first.hosts + second.hosts} Host assignment(s) preserved`, `${first.attendances + second.attendances} attendance record(s) preserved`] });
  }
  return pairs.sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}
