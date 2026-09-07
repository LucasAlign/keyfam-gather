import { db } from "@/lib/db";
import { probableDuplicatePairs } from "@/lib/duplicate-queue";
import { visibleRecommendation } from "@/lib/recommendations";

export async function getDuplicateQueue(eventId: string, now = new Date()) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, organizationId: true } }); if (!event) return null;
  const people = await db.person.findMany({ where: { organizationId: event.organizationId, mergedIntoPersonId: null }, select: { id: true, firstName: true, lastName: true, email: true, emailNormalized: true, phone: true, phoneNormalized: true, updatedAt: true, _count: { select: { registrations: true, invitations: true, eventHosts: true } }, registrations: { select: { checkIn: { select: { id: true } } } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const pairs = probableDuplicatePairs(people.map((item) => ({ id: item.id, firstName: item.firstName, lastName: item.lastName, email: item.email, emailNormalized: item.emailNormalized, phone: item.phone, phoneNormalized: item.phoneNormalized, updatedAt: item.updatedAt, registrations: item._count.registrations, invitations: item._count.invitations, hosts: item._count.eventHosts, attendances: item.registrations.filter(({ checkIn }) => checkIn).length })));
  const decisions = await db.recommendation.findMany({ where: { eventId, kind: "PERSON_DUPLICATE", dedupeKey: { in: pairs.map(({ key }) => key) } }, orderBy: { decidedAt: "desc" } });
  return { event, pairs: pairs.filter((pair) => { const decision = decisions.find((item) => item.dedupeKey === pair.key && item.sourceFingerprint === pair.fingerprint); return !decision || visibleRecommendation(decision.status, decision.snoozedUntil, now); }) };
}
