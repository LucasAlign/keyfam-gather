import { Prisma, RecommendationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { detectFundraisingRecommendations, detectSponsorshipRecommendations } from "@/lib/fundraising-recommendations";
import { buildHostFollowups } from "@/lib/host-followup";
import { buildHostGroupHealth } from "@/lib/host-health";
import { buildOutreachRecommendation, forecastRegistrationPace, FORECAST_DISCLAIMER } from "@/lib/registration-pace";
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

export function allowsOperationalRecommendations(status: string) {
  return status !== "COMPLETED" && status !== "ARCHIVED";
}

export function detectReadinessRecommendations(facts: ReadinessFacts): RecommendationProposal[] {
  const base = `/events/${facts.eventId}`;
  const proposals: RecommendationProposal[] = [];
  if (!facts.contactEmail && !facts.contactPhone) proposals.push({ kind: "EVENT_CONTACT", dedupeKey: "event-contact", title: "Add an Event contact", why: "Guests and staff need a clear person to contact when plans change or questions come up.", evidence: { hasContactEmail: false, hasContactPhone: false }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/settings`, label: "Review Event settings" }, expectedImpact: "Registration and Event materials can point guests to a reliable contact.", confidence: 1 });
  if (!facts.isPublic) proposals.push({ kind: "REGISTRATION_SHARING", dedupeKey: "registration-sharing", title: "Review how guests will register", why: "Public registration is not currently available, so guests need another intentional path into the Event.", evidence: { publicRegistrationEnabled: false, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/settings`, label: "Review registration settings" }, expectedImpact: "The coordinator can confirm whether registration should be public or staff-managed.", confidence: 1 });
  if (facts.tableCount === 0) proposals.push({ kind: "SEATING_SETUP", dedupeKey: "seating-setup", title: "Create Seating Tables", why: "No seating destinations exist yet, which blocks safe assignments and Event-night Table context.", evidence: { tableCount: 0, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/seating`, label: "Open Tables and seating" }, expectedImpact: "Guests can be assigned with deterministic capacity checks.", confidence: 1 });
  if (facts.unassignedCount > 0) proposals.push({ kind: "UNASSIGNED_GUESTS", dedupeKey: "unassigned-guests", title: `Seat ${facts.unassignedCount} unassigned guest${facts.unassignedCount === 1 ? "" : "s"}`, why: "Unassigned guests create avoidable confusion for coordinators and check-in staff.", evidence: { unassignedGuests: facts.unassignedCount, activeRegistrations: facts.registrationCount }, proposedAction: { type: "REVIEW_WORKSPACE", href: `${base}/seating`, label: "Review seating" }, expectedImpact: "Every reviewed guest has a clear seating destination before Event night.", confidence: 1 });
  return proposals;
}

async function currentProposals(eventId: string, now = new Date()) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, status: true, startsAt: true, registrationClosesAt: true, capacity: true, attendanceGoal: true, contactEmail: true, contactPhone: true, isPublic: true, fundraisingGoalCents: true, _count: { select: { seatingTables: true, registrations: { where: { status: "ACTIVE" } } } }, registrations: { where: { status: "ACTIVE" }, select: { id: true, tableId: true, registeredAt: true } }, groups: { select: { id: true, name: true, capacity: true, registrations: { where: { status: "ACTIVE" }, select: { person: { select: { email: true, phone: true } } } }, hosts: { select: { person: { select: { firstName: true, lastName: true } }, accessTokens: { orderBy: { createdAt: "desc" }, take: 1, select: { expiresAt: true, revokedAt: true, lastUsedAt: true } } } } } }, fundraisingCommitments: { where: { status: "ACTIVE" }, select: { id: true, kind: true, amountCents: true, description: true, person: { select: { firstName: true, lastName: true } }, transactions: { select: { kind: true, amountCents: true } } } }, sponsorships: { select: { id: true, guestAllotment: true, benefits: true, recognitionNeeds: true, fulfillmentStatus: true, sponsor: { select: { name: true, logoUrl: true } }, group: { select: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } }, commitment: { select: { amountCents: true, transactions: { select: { kind: true, amountCents: true } } } } } } } });
  if (!event) throw new Error("This Event no longer exists.");
  const cash = (transactions: Array<{ kind: "PAYMENT" | "REFUND"; amountCents: number }>) => transactions.reduce((sum, transaction) => sum + (transaction.kind === "PAYMENT" ? transaction.amountCents : -transaction.amountCents), 0);
  const horizon = event.registrationClosesAt ?? event.startsAt;
  const daysRemaining = Math.max(0, Math.ceil((horizon.getTime() - now.getTime()) / 86_400_000));
  const recentCutoff = new Date(now.getTime() - 7 * 86_400_000);
  const forecast = forecastRegistrationPace({ goal: event.attendanceGoal ?? event.capacity, registered: event._count.registrations, daysRemaining, recentVelocityPerDay: event.registrations.filter((item) => item.registeredAt >= recentCutoff).length / 7, velocityWindowDays: 7, calculatedAt: now });
  const outreach = buildOutreachRecommendation(forecast);
  const registrationProposals: RecommendationProposal[] = outreach ? [{ kind: "REGISTRATION_PACE", dedupeKey: "registration-pace", title: `Registration is projected ${outreach.shortfall} below goal`, why: outreach.reason, evidence: { goal: forecast.goal, registered: forecast.registered, daysRemaining: forecast.daysRemaining, velocityPerDay: forecast.velocityPerDay, projectedFinal: forecast.projectedFinal, projectedLow: forecast.projectedRange.low, projectedHigh: forecast.projectedRange.high, projectedGap: forecast.projectedGap, confidence: forecast.confidence, inputs: forecast.inputs.join("; "), disclaimer: FORECAST_DISCLAIMER }, proposedAction: { type: "REVIEW_WORKSPACE", href: `/events/${eventId}/communications`, label: "Draft registration outreach" }, expectedImpact: "Staff can review a targeted outreach campaign before anything is sent.", confidence: forecast.confidence === "high" ? 0.85 : forecast.confidence === "medium" ? 0.65 : 0.45 }] : [];
  const hostHealth = event.groups.flatMap((group) => group.hosts.map((host) => { const token = host.accessTokens[0]; const linkStatus = !token ? "none" : token.revokedAt ? "revoked" : token.expiresAt <= now ? "expired" : "active"; return buildHostGroupHealth({ groupId: group.id, groupName: group.name, hostName: `${host.person.firstName} ${host.person.lastName}`, capacity: group.capacity, activeRegistrations: group.registrations.length, missingContactCount: group.registrations.filter((item) => !item.person.email && !item.person.phone).length, linkStatus, lastActivityAt: token?.lastUsedAt ?? null }); }));
  const hostProposals: RecommendationProposal[] = buildHostFollowups(hostHealth, daysRemaining).map((followup) => ({ kind: "HOST_FOLLOWUP", dedupeKey: `host-followup:${followup.groupId}`, title: `Follow up with ${followup.hostName}`, why: followup.reasons.join(" "), evidence: { groupId: followup.groupId, groupName: followup.groupName, urgency: followup.urgency, remaining: followup.remaining, needsPortalLink: followup.needsPortalLink }, proposedAction: { type: "REVIEW_WORKSPACE", href: `/events/${eventId}/hosts/health`, label: "Review host follow-up" }, expectedImpact: "Staff can edit the reminder and recover the Host portal link before approving delivery.", confidence: 1 }));
  const postEvent = !allowsOperationalRecommendations(event.status);
  const proposals = postEvent ? [] : [...detectReadinessRecommendations({ eventId, contactEmail: event.contactEmail, contactPhone: event.contactPhone, isPublic: event.isPublic, tableCount: event._count.seatingTables, registrationCount: event._count.registrations, unassignedCount: event.registrations.filter((item) => !item.tableId).length }), ...registrationProposals, ...hostProposals, ...detectFundraisingRecommendations(eventId, event.fundraisingGoalCents, event.fundraisingCommitments.map((item) => ({ id: item.id, label: item.description || (item.person ? `${item.person.firstName} ${item.person.lastName}` : item.kind), kind: item.kind, amountCents: item.amountCents, receivedCents: cash(item.transactions) }))), ...detectSponsorshipRecommendations(eventId, event.sponsorships.map((item) => ({ id: item.id, sponsorName: item.sponsor.name, guestAllotment: item.guestAllotment, registeredGuests: item.group?._count.registrations ?? 0, hasLogo: Boolean(item.sponsor.logoUrl?.trim()), hasBenefits: Boolean(item.benefits?.trim()), hasRecognition: Boolean(item.recognitionNeeds?.trim()), commitmentCents: item.commitment.amountCents, receivedCents: cash(item.commitment.transactions), fulfillmentStatus: item.fulfillmentStatus })))] .map(prepareRecommendation);
  return { event, proposals };
}

export async function eventCopilot(eventId: string, now = new Date()) {
  const { proposals } = await currentProposals(eventId, now);
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
