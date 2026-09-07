"use server";

import { Prisma, RecommendationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEventStewardship } from "@/lib/event-stewardship";

export async function approveStewardshipPlan(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const fingerprint = String(formData.get("fingerprint") ?? "");
  const workspace = await getEventStewardship(eventId);
  if (!workspace || workspace.plan.fingerprint !== fingerprint) throw new Error("Event data changed. Review the refreshed stewardship plan.");
  const { user } = await requireActor(workspace.event.organizationId, "event:manage", eventId);
  const selected = new Set(formData.getAll("recipientKeys").map(String));
  const allowed = new Set(workspace.plan.segments.flatMap((segment) => segment.recipients.map((person) => `${segment.kind}:${person.id}`)));
  if ([...selected].some((key) => !allowed.has(key))) throw new Error("A selected recipient is no longer eligible.");
  const approvedSegments = workspace.plan.segments.map((segment) => ({ ...segment, recipients: segment.recipients.filter((person) => selected.has(`${segment.kind}:${person.id}`)) }));
  await db.$transaction(async (tx) => {
    const existing = await tx.recommendation.findUnique({ where: { eventId_dedupeKey_sourceFingerprint: { eventId, dedupeKey: "post-event-stewardship", sourceFingerprint: fingerprint } } });
    if (existing?.status === RecommendationStatus.APPROVED) throw new Error("This stewardship plan was already approved.");
    const record = await tx.recommendation.upsert({ where: { eventId_dedupeKey_sourceFingerprint: { eventId, dedupeKey: "post-event-stewardship", sourceFingerprint: fingerprint } }, create: { organizationId: workspace.event.organizationId, eventId, kind: "POST_EVENT_STEWARDSHIP", status: RecommendationStatus.APPROVED, title: "Approved post-Event stewardship plan", why: "Follow-up audiences and drafts were reviewed against canonical Event evidence.", evidence: workspace.plan.snapshot as Prisma.InputJsonValue, proposedAction: { type: "DRAFT_COMMUNICATIONS_AND_REPORT", segments: approvedSegments } as Prisma.InputJsonValue, expectedImpact: "Approved drafts are ready for communications delivery and next-year rollover planning.", confidence: 1, dedupeKey: "post-event-stewardship", sourceFingerprint: fingerprint, decidedById: user.id, decidedAt: new Date() }, update: { status: RecommendationStatus.APPROVED, proposedAction: { type: "DRAFT_COMMUNICATIONS_AND_REPORT", segments: approvedSegments } as Prisma.InputJsonValue, decidedById: user.id, decidedAt: new Date() } });
    let draftCampaigns = 0;
    for (const segment of approvedSegments.filter((item) => item.recipients.some((person) => person.email))) {
      await tx.campaign.create({ data: { organizationId: workspace.event.organizationId, eventId, name: `${segment.label} stewardship`, category: segment.kind === "NO_SHOWS" ? "NO_SHOW" : "THANK_YOU", channel: "EMAIL", segment: "selected_people", audiencePersonIds: segment.recipients.map(({ id }) => id), subject: segment.subject, body: segment.message, status: "DRAFT", createdById: user.id } });
      draftCampaigns += 1;
    }
    await tx.auditLog.create({ data: { organizationId: workspace.event.organizationId, eventId, actorId: user.id, action: "stewardship.plan_approved", entityType: "Recommendation", entityId: record.id, newState: JSON.stringify({ fingerprint, selectedRecipients: selected.size, draftCampaigns, segments: approvedSegments.map((segment) => ({ kind: segment.kind, count: segment.recipients.length })) }) } });
  });
  revalidatePath(`/events/${eventId}/stewardship`);
  revalidatePath(`/events/${eventId}/communications`);
}
