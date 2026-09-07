import { describe, expect, it } from "vitest";
import { probableDuplicatePairs, type DuplicatePersonFact } from "./duplicate-queue";
const person = (id: string, email: string | null, phone: string | null): DuplicatePersonFact => ({ id, firstName: "José", lastName: "Smith", email, emailNormalized: email, phone, phoneNormalized: phone, updatedAt: new Date("2026-09-07"), registrations: 1, invitations: 1, hosts: 0, attendances: 1 });
describe("duplicate queue", () => {
  it("explains exact identity evidence without merging", () => { const pair = probableDuplicatePairs([person("a", "a@x.test", "555"), person("b", "a@x.test", "555")])[0]; expect(pair.confidence).toBe(1); expect(pair.evidence).toContain("Matching email"); expect(pair.consequences.join(" ")).toContain("attendance"); });
  it("fingerprints material Person changes", () => { const original = probableDuplicatePairs([person("a", null, null), person("b", null, null)])[0]; const changed = person("b", null, null); changed.updatedAt = new Date("2026-09-08"); expect(probableDuplicatePairs([person("a", null, null), changed])[0].fingerprint).not.toBe(original.fingerprint); });
});
