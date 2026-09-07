"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { buildAudience, renderTemplate, type SegmentId, type TemplateVars } from "@/lib/communications";
import { loadAudienceCandidates } from "@/lib/communications-workspace";
import { db } from "@/lib/db";
import { getDeliveryProvider, type DeliveryResult } from "@/lib/delivery";
import { campaignSchema, messageTemplateSchema } from "@/lib/validation";

export type CommunicationsActionState = { error?: string; success?: string; fields?: Record<string, string[]> };

function entries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function authorizeEvent(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, name: true, startsAt: true, timezone: true, venue: true } });
  if (!event) throw new Error("This Event no longer exists.");
  const { user } = await requireActor(event.organizationId, "invitation:manage", eventId);
  return { event, organizationId: event.organizationId, actorId: user.id };
}

export async function createMessageTemplate(_: CommunicationsActionState, formData: FormData): Promise<CommunicationsActionState> {
  const parsed = messageTemplateSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the template details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { organizationId, actorId } = await authorizeEvent(parsed.data.eventId);
    const template = await db.messageTemplate.create({ data: { organizationId, eventId: parsed.data.eventId, name: parsed.data.name, category: parsed.data.category, channel: parsed.data.channel, subject: parsed.data.subject ?? null, body: parsed.data.body } });
    await db.auditLog.create({ data: { organizationId, eventId: parsed.data.eventId, actorId, action: "communications.template_created", entityType: "MessageTemplate", entityId: template.id, newState: JSON.stringify({ name: template.name, category: template.category, channel: template.channel }) } });
    revalidatePath(`/events/${parsed.data.eventId}/communications`);
    return { success: "Template saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't save this template." };
  }
}

export async function createCampaign(_: CommunicationsActionState, formData: FormData): Promise<CommunicationsActionState> {
  const parsed = campaignSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the campaign details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { organizationId, actorId } = await authorizeEvent(parsed.data.eventId);
    const campaign = await db.campaign.create({ data: {
      organizationId, eventId: parsed.data.eventId, name: parsed.data.name, category: parsed.data.category, channel: parsed.data.channel,
      segment: parsed.data.segment, subject: parsed.data.subject ?? null, body: parsed.data.body,
      templateId: parsed.data.templateId ?? null, scheduledFor: parsed.data.scheduledFor ?? null,
      status: parsed.data.scheduledFor ? "SCHEDULED" : "DRAFT", createdById: actorId,
    } });
    await db.auditLog.create({ data: { organizationId, eventId: parsed.data.eventId, actorId, action: "communications.campaign_drafted", entityType: "Campaign", entityId: campaign.id, newState: JSON.stringify({ name: campaign.name, segment: campaign.segment, channel: campaign.channel, status: campaign.status }) } });
    revalidatePath(`/events/${parsed.data.eventId}/communications`);
    return { success: parsed.data.scheduledFor ? "Campaign scheduled — review and send when ready." : "Draft created — review the audience, then approve and send." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't create this campaign." };
  }
}

// Explicit approval + bulk send. Rebuilds the audience from current event state
// (so opt-outs and new registrations are respected at send time), delivers via
// the configured provider, records one CampaignDelivery per recipient, and
// stamps the approval on the campaign. Audited.
export async function sendCampaign(_: CommunicationsActionState, formData: FormData): Promise<CommunicationsActionState> {
  const campaignId = String(formData.get("campaignId") ?? "");
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: "This campaign no longer exists." };
  if (campaign.status === "SENT") return { error: "This campaign was already sent." };
  try {
    const { event, organizationId, actorId } = await authorizeEvent(campaign.eventId);
    const candidates = await loadAudienceCandidates(campaign.eventId);
    const audience = buildAudience(candidates, campaign.segment as SegmentId, campaign.channel);
    if (audience.recipients.length === 0) return { error: "No reachable recipients match this audience right now." };

    const provider = getDeliveryProvider(campaign.channel);
    const eventDate = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: event.timezone }).format(event.startsAt);
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of audience.recipients) {
      const vars: TemplateVars = { firstName: recipient.firstName, lastName: recipient.lastName, eventName: event.name, eventDate, venue: event.venue ?? "" };
      const body = renderTemplate(campaign.body, vars);
      const subject = campaign.subject ? renderTemplate(campaign.subject, vars) : undefined;
      let outcome: DeliveryResult;
      try {
        outcome = await provider.send({ channel: campaign.channel, to: recipient.recipient, subject, body });
      } catch (error) {
        outcome = { status: "FAILED", error: error instanceof Error ? error.message : "Delivery failed." };
      }
      if (outcome.status === "SENT") sentCount += 1; else failedCount += 1;
      await db.campaignDelivery.create({ data: { organizationId, eventId: campaign.eventId, campaignId: campaign.id, personId: recipient.personId, channel: campaign.channel, recipient: recipient.recipient, status: outcome.status, providerMessageId: outcome.providerMessageId ?? null, error: outcome.error ?? null } });
    }

    await db.campaign.update({ where: { id: campaign.id }, data: { status: "SENT", approvedById: actorId, approvedAt: new Date(), sentAt: new Date(), totalRecipients: audience.recipients.length, sentCount, failedCount, optedOutCount: audience.optedOut } });
    await db.auditLog.create({ data: { organizationId, eventId: campaign.eventId, actorId, action: "communications.campaign_sent", entityType: "Campaign", entityId: campaign.id, newState: JSON.stringify({ totalRecipients: audience.recipients.length, sentCount, failedCount, optedOut: audience.optedOut, unreachable: audience.unreachable }) } });
    revalidatePath(`/events/${campaign.eventId}/communications`);
    return { success: `Sent ${sentCount} of ${audience.recipients.length} messages${failedCount ? `, ${failedCount} failed` : ""}${audience.optedOut ? `, ${audience.optedOut} skipped (opted out)` : ""}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't send this campaign." };
  }
}
