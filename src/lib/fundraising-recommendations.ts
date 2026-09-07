import type { RecommendationProposal } from "@/lib/recommendations";

type CommitmentFact = { id: string; label: string; kind: "DONATION" | "PLEDGE" | "SPONSORSHIP" | "TICKET"; amountCents: number; receivedCents: number };
type SponsorshipFact = { id: string; sponsorName: string; guestAllotment: number; registeredGuests: number; hasLogo: boolean; hasBenefits: boolean; hasRecognition: boolean; commitmentCents: number; receivedCents: number; fulfillmentStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" };

const projectedRate = { DONATION: 1, TICKET: 1, PLEDGE: 0.75, SPONSORSHIP: 0.85 } as const;

export function fundraisingForecast(goalCents: number | null, commitments: CommitmentFact[]) {
  const committedCents = commitments.reduce((sum, item) => sum + item.amountCents, 0);
  const receivedCents = commitments.reduce((sum, item) => sum + item.receivedCents, 0);
  const refundedCents = commitments.reduce((sum, item) => sum + Math.max(-item.receivedCents, 0), 0);
  const outstandingCents = commitments.reduce((sum, item) => sum + Math.max(item.amountCents - Math.max(item.receivedCents, 0), 0), 0);
  const projectedCents = commitments.reduce((sum, item) => sum + Math.max(item.receivedCents, 0) + Math.max(item.amountCents - Math.max(item.receivedCents, 0), 0) * projectedRate[item.kind], 0);
  return { goalCents, committedCents, receivedCents: Math.max(receivedCents, 0), refundedCents, outstandingCents, projectedCents: Math.round(projectedCents), remainingToGoalCents: goalCents === null ? null : Math.max(goalCents - Math.max(receivedCents, 0), 0), projectedGapCents: goalCents === null ? null : Math.max(goalCents - projectedCents, 0) };
}

export function detectFundraisingRecommendations(eventId: string, goalCents: number | null, commitments: CommitmentFact[]): RecommendationProposal[] {
  if (goalCents === null) return [];
  const forecast = fundraisingForecast(goalCents, commitments);
  const outstanding = commitments.filter((item) => item.amountCents > item.receivedCents).sort((a, b) => (b.amountCents - b.receivedCents) - (a.amountCents - a.receivedCents));
  if (!forecast.remainingToGoalCents && !forecast.outstandingCents) return [];
  return [{ kind: "FUNDRAISING_PACE", dedupeKey: "fundraising-pace", title: forecast.projectedGapCents ? "Fundraising is projected below goal" : "Follow up on outstanding commitments", why: forecast.projectedGapCents ? "Expected payments from current commitments do not yet cover the fundraising goal." : "The goal is projected to be met, but committed money has not all been received.", evidence: { goalCents, committedCents: forecast.committedCents, receivedCents: forecast.receivedCents, refundedCents: forecast.refundedCents, outstandingCents: forecast.outstandingCents, projectedCents: forecast.projectedCents, remainingToGoalCents: forecast.remainingToGoalCents, projectedGapCents: forecast.projectedGapCents, forecastMethod: "Received cash plus 100% of Donation/Ticket, 85% of Sponsorship, and 75% of Pledge balances", contributingRecords: outstanding.slice(0, 8).map((item) => `${item.label} (${item.amountCents - item.receivedCents} cents)`).join("; ") || "No outstanding commitments" }, proposedAction: { type: "REVIEW_WORKSPACE", href: `/events/${eventId}/fundraising`, label: "Review fundraising" }, expectedImpact: "Staff can verify the forecast and select the smallest set of outstanding commitments for approved follow-up.", confidence: commitments.length >= 5 ? 0.75 : 0.55 }];
}

export function detectSponsorshipRecommendations(eventId: string, sponsorships: SponsorshipFact[]): RecommendationProposal[] {
  return sponsorships.flatMap((item) => {
    if (item.fulfillmentStatus === "COMPLETE") return [];
    const missing = [item.registeredGuests < item.guestAllotment && `${item.guestAllotment - item.registeredGuests} guest name(s)`, !item.hasLogo && "logo", !item.hasBenefits && "benefit details", !item.hasRecognition && "recognition details", item.receivedCents < item.commitmentCents && `${item.commitmentCents - item.receivedCents} cents payment`].filter(Boolean) as string[];
    if (!missing.length) return [];
    return [{ kind: "SPONSORSHIP_FULFILLMENT", dedupeKey: `sponsorship:${item.id}`, title: `Complete ${item.sponsorName} fulfillment`, why: "Missing sponsor inputs can affect guest seating, promised recognition, payment reporting, and the run of show.", evidence: { sponsor: item.sponsorName, guestAllotment: item.guestAllotment, registeredGuests: item.registeredGuests, hasLogo: item.hasLogo, hasBenefits: item.hasBenefits, hasRecognition: item.hasRecognition, commitmentCents: item.commitmentCents, receivedCents: item.receivedCents, fulfillmentStatus: item.fulfillmentStatus, missingItems: missing.join(", ") }, proposedAction: { type: "REVIEW_WORKSPACE", href: `/events/${eventId}/fundraising`, label: "Review sponsor" }, expectedImpact: `Staff can confirm or request only these outstanding items: ${missing.join(", ")}.`, confidence: 1 } satisfies RecommendationProposal];
  });
}
