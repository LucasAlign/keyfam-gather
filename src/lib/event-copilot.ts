import { Prisma, RecommendationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { detectFundraisingRecommendations, detectSponsorshipRecommendations } from "@/lib/fundraising-recommendations";
import { prepareRecommendation, type RecommendationProposal, visibleRecommendation } from "@/lib/recommendations";

type ReadinessFacts = {
  eventId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  isPublic: boolean;
  tableCount: number;
  registrationCount: number;
  unassignedCount: number;
};

export function detectReadinessRecommendations(facts: ReadinessFacts): RecommendationProposal[] {
  const base = `/events/${facts.eventId}`;
  const proposals: RecommendationProposal[] = [];
  if (!facts.contactEmail && !facts.contactPhone) proposals.push({ kind: "EVENT_CONTACT", dedupeKey: "event-contact", title: "Add an Event contact", why: "Guests and staff need a clear person to contact when plans change or questions come up.", evidence: { hasContactEmail: false, hasContactPhone: false }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/settings`, label: "Review Event settings" }, expectedImpact: "Registration and Event materials can point guests to a reliable contact.", confidence: 1 });
  if (!facts.isPublic) proposals.push({ kind: "REGISTRATION_SHARING", dedupeKey: "registration-sharing", title: "Review how guests will register", why: "Public registration is not currently available, so guests need another intentional path into the Event.", evidence: { publicRegistrationEnabled: false, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/settings`, label: "Review registration settings" }, expectedImpact: "The coordinator can confirm whether registration should be public or staff-managed.", confidence: 1 });
  if (facts.tableCount === 0) proposals.push({ kind: "SEATING_SETUP", dedupeKey: "seating-setup", title: "Create Seating Tables", why: "No seating destinations exist yet, which blocks safe assignments and Event-night Table context.", evidence: { tableCount: 0, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/seating`, label: "Open Tables and seating" }, expectedImpact: "Guests can be assigned with deterministic capacity checks.", confidence: 1 });
  if (facts.unassignedCount > 0) proposals.push({ kind: "UNASSIGNED_GUESTS", dedupeKey: "unassigned-guests", title: `Seat ${facts.unassignedCount} unassigned guest${facts.unassignedCount === 1 ? "" : "s"}`, why: "Unassigned guests create avoidable confusion for coordinators and check-in staff.", evidence: { unassignedGuests: facts.unassignedCount, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/seating`, label: "Review seating" }, expectedImpact: "Every reviewed guest has a clear seating destination before Event night.", confidence: 1 });
  return proposals;
}

async function currentProposals(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, status: true, contactEmail: true, contactPhone: true, isPublic: true, fundraisingGoalCents: true, _count: { select: { seatingTables: true, registrations: { where: { status: "ACTIVE" } } } }, registrations: { where: { status: "ACTIVE", tableId: null }, select: { id: true } }, fundraisingCommitments: { where: { status: "ACTIVE" }, select: { id: true, kind: true, amountCents: true, description: true, person: { select: { firstName: true, lastName: true } }, transactions: { select: { kind: true, amountCents: true } } } }, sponsorships: { select: { id: true, guestAllotment: true, benefits: true, recognitionNeeds: true, fulfillmentStatus: true, sponsor: { select: { name: true, logoUrl: true } }, group: { select: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } }, commitment: { select: { amountCents: true, transactions: { select: { kind: true, amountCents: true } } } } } } } });
  if (!event) throw new Error("This Event no longer exists.");
  const cash = (transactions: Array<{ kind: "PAYMENT" | "REFUND"; amountCents: number }>) => transactions.reduce((sum, transaction) => sum + (transaction.kind === "PAYMENT" ? transaction.amountCents : -transaction.amountCents), 0);
  const proposals = event.status === "ARCHIVED" ? [] : [...detectReadinessRecommendations({ eventId, contactEmail: event.contactEmail, contactPhone: event.contactPhone, isPublic: event.isPublic, tableCount: event._count.seatingTables, registrationCount: event._count.registrations, unassignedCount: event.registrations.length }), ...detectFundraisingRecommendations(eventId, event.fundraisingGoalCents, event.fundraisingCommitments.map((item) => ({ id: item.id, label: item.description || (item.person ? `${item.person.firstName} ${item.person.lastName}` : item.kind), kind: item.kind, amountCents: item.amountCents, receivedCents: cash(item.transactions) }))), ...detectSponsorshipRecommendations(eventId, event.sponsorships.map((item) => ({ id: item.id, sponsorName: item.sponsor.name, guestAllotment: item.guestAllotment, registeredGuests: item.group?._count.registrations ?? 0, hasLogo: Boolean(item.sponsor.logoUrl?.trim()), hasBenefits: Boolean(item.benefits?.trim()), hasRecognition: Boolean(item.recognitionNeeds?.trim()), commitmentCents: item.commitment.amountCents, receivedCents: cash(item.commitment.transactions), fulfillmentStatus: item.fulfillmentStatus })))] .map(prepareRecommendation);
  return { event, proposals };
}

export async function eventCopilot(eventId: string, now = new Date()) {
  const { proposals } = await currentProposals(eventId);
  const history = await db.recommendation.findMany({ where: { eventId, dedupeKey: { in: proposals.map(({ dedupeKey }) => dedupeKey) } }, orderBy: { createdAt: "desc" } });
  return proposals.flatMap((proposal) => {
    const decision = history.find((item) => item.dedupeKey === proposal.dedupeKey && item.sourceFingerprint === proposal.sourceFingerprint);
    const status = decision?.status ?? RecommendationStatus.PROPOSED;
    if (!visibleRecommendation(status, decision?.snoozedUntil ?? null, now)) return [];
    return [{ ...proposal, id: decision?.id ?? null, status }];
  });
}

export type RecommendationDecision = "APPROVE" | "DISMISS" | "SNOOZE";

export async function decideRecommendation(input: { eventId: string; organizationId: string; actorId: string; dedupeKey: string; sourceFingerprint: string; decision: RecommendationDecision; snoozedUntil?: Date }) {
  const { event, proposals } = await currentProposals(input.eventId);
  if (event.organizationId !== input.organizationId) throw new Error("That recommendation is not available for this organization.");
  const proposal = proposals.find((item) => item.dedupeKey === input.dedupeKey && item.sourceFingerprint === input.sourceFingerprint);
  if (!proposal) throw new Error("The Event changed. Review the refreshed recommendation before deciding.");
  if (input.decision === "SNOOZE" && (!input.snoozedUntil || input.snoozedUntil <= new Date())) throw new Error("Choose a future reminder time.");
  const status = input.decision === "APPROVE" ? RecommendationStatus.EXECUTED : input.decision === "DISMISS" ? RecommendationStatus.DISMISSED : RecommendationStatus.SNOOZED;
  return db.$transaction(async (tx) => {
    const existing = await tx.recommendation.findUnique({ where: { eventId_dedupeKey_sourceFingerprint: { eventId: input.eventId, dedupeKey: proposal.dedupeKey, sourceFingerprint: proposal.sourceFingerprint } } });
    if (existing && existing.status !== "PROPOSED" && existing.status !== "APPROVED") throw new Error("This recommendation has already been decided.");
    const now = new Date();
    const record = await tx.recommendation.upsert({ where: { eventId_dedupeKey_sourceFingerprint: { eventId: input.eventId, dedupeKey: proposal.dedupeKey, sourceFingerprint: proposal.sourceFingerprint } }, create: { organizationId: input.organizationId, eventId: input.eventId, kind: proposal.kind, title: proposal.title, why: proposal.why, evidence: proposal.evidence as Prisma.InputJsonValue, proposedAction: proposal.proposedAction as Prisma.InputJsonValue, expectedImpact: proposal.expectedImpact, confidence: proposal.confidence, dedupeKey: proposal.dedupeKey, sourceFingerprint: proposal.sourceFingerprint, status, snoozedUntil: input.decision === "SNOOZE" ? input.snoozedUntil : null, decidedById: input.actorId, decidedAt: now, executedAt: input.decision === "APPROVE" ? now : null }, update: { status, snoozedUntil: input.decision === "SNOOZE" ? input.snoozedUntil : null, decidedById: input.actorId, decidedAt: now, executedAt: input.decision === "APPROVE" ? now : null } });
    await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: input.eventId, actorId: input.actorId, action: `recommendation.${status.toLowerCase()}`, entityType: "Recommendation", entityId: record.id, previousState: existing ? JSON.stringify({ status: existing.status, snoozedUntil: existing.snoozedUntil }) : null, newState: JSON.stringify({ status, dedupeKey: proposal.dedupeKey, sourceFingerprint: proposal.sourceFingerprint, snoozedUntil: record.snoozedUntil, proposedAction: proposal.proposedAction }) } });
    return { record, href: input.decision === "APPROVE" ? proposal.proposedAction.href : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
