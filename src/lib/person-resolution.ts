import type { Person, Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { withSerializableRetry } from "@/lib/transactions";

export type PersonIdentity = { firstName: string; lastName: string; email?: string; phone?: string; addressLine1?: string; addressLine2?: string; city?: string; region?: string; postalCode?: string; country?: string };
export type Resolution = { kind: "EXACT"; personId: string; matchedBy: "EMAIL" | "PHONE" | "NAME_ADDRESS" } | { kind: "SUGGESTIONS"; personIds: string[] } | { kind: "NEW" } | { kind: "CONFLICT" };

export const normalizeName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const normalizeAddress = (input: PersonIdentity) => normalizeName([input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode, input.country].filter(Boolean).join(" "));

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= b.length; j += 1) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; } }
  return row[b.length];
}

export function suggestSimilarNames(input: Pick<PersonIdentity, "firstName" | "lastName">, people: Array<Pick<Person, "id" | "firstName" | "lastName">>) {
  const wanted = normalizeName(`${input.firstName} ${input.lastName}`);
  if (wanted.length < 5) return [];
  return people.filter((person) => { const name = normalizeName(`${person.firstName} ${person.lastName}`); return editDistance(wanted, name) <= Math.max(1, Math.floor(wanted.length * 0.18)); }).slice(0, 5).map(({ id }) => id);
}

export async function resolvePerson(tx: Prisma.TransactionClient, organizationId: string, input: PersonIdentity): Promise<Resolution> {
  const emailNormalized = input.email ? normalizeEmail(input.email) : null;
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
  const active = { organizationId, mergedIntoPersonId: null };
  const email = emailNormalized ? await tx.person.findFirst({ where: { ...active, emailNormalized } }) : null;
  const phone = phoneNormalized ? await tx.person.findFirst({ where: { ...active, phoneNormalized } }) : null;
  if (email && phone && email.id !== phone.id) return { kind: "CONFLICT" };
  if (email) return { kind: "EXACT", personId: email.id, matchedBy: "EMAIL" };
  if (phone) return { kind: "EXACT", personId: phone.id, matchedBy: "PHONE" };
  const addressNormalized = normalizeAddress(input);
  if (addressNormalized) {
    const sameAddress = await tx.person.findMany({ where: { ...active, addressNormalized }, take: 20 });
    const exact = sameAddress.filter((person) => normalizeName(`${person.firstName} ${person.lastName}`) === normalizeName(`${input.firstName} ${input.lastName}`));
    if (exact.length === 1) return { kind: "EXACT", personId: exact[0].id, matchedBy: "NAME_ADDRESS" };
  }
  const surname = normalizeName(input.lastName);
  const nearby = await tx.person.findMany({ where: { ...active, lastName: { startsWith: surname.slice(0, 2), mode: "insensitive" } }, take: 30 });
  const personIds = suggestSimilarNames(input, nearby);
  return personIds.length ? { kind: "SUGGESTIONS", personIds } : { kind: "NEW" };
}

export async function mergePeople(input: { organizationId: string; eventId: string; actorId: string; sourcePersonId: string; targetPersonId: string; reason?: string }) {
  if (input.sourcePersonId === input.targetPersonId) throw new Error("Choose two different people to merge.");
  return withSerializableRetry(async (tx) => {
    const [source, target] = await Promise.all([input.sourcePersonId, input.targetPersonId].map((id) => tx.person.findFirst({ where: { id, organizationId: input.organizationId, mergedIntoPersonId: null }, include: { registrations: true } })));
    if (!source || !target) throw new Error("One of these people is no longer available.");
    const targetByEvent = new Map(target.registrations.map((registration) => [registration.eventId, registration]));
    const superseded: string[] = [];
    for (const registration of source.registrations) {
      const winner = targetByEvent.get(registration.eventId);
      if (winner) {
        await tx.registration.update({ where: { id: registration.id }, data: { status: "SUPERSEDED", cancelledAt: null, supersededAt: new Date(), supersededByRegistrationId: winner.id } });
        superseded.push(registration.id);
      } else await tx.registration.update({ where: { id: registration.id }, data: { personId: target.id } });
    }
    await tx.eventHost.updateMany({ where: { personId: source.id }, data: { personId: target.id } });
    await tx.invitation.updateMany({ where: { inviteeId: source.id }, data: { inviteeId: target.id } });
    const merged = await tx.person.update({ where: { id: source.id }, data: { emailNormalized: null, phoneNormalized: null, mergedIntoPersonId: target.id, mergedAt: new Date() } });
    const result = { targetPersonId: target.id, reassignedRegistrations: source.registrations.length - superseded.length, supersededRegistrations: superseded };
    await tx.personMerge.create({ data: { organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId, sourcePersonId: source.id, targetPersonId: target.id, reason: input.reason, sourceSnapshot: source as unknown as Prisma.InputJsonValue, targetSnapshot: target as unknown as Prisma.InputJsonValue, resultSnapshot: result } });
    await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId, action: "person.merged", entityType: "Person", entityId: target.id, previousState: JSON.stringify({ source, target }), newState: JSON.stringify({ merged, result }) } });
    return result;
  });
}
