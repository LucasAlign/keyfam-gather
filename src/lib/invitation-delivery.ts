import { db } from "@/lib/db";
import { getDeliveryProvider, type DeliveryChannel, type DeliveryResult } from "@/lib/delivery";

export function resolveInvitationDeliveryChannel(invitation: { email: string | null; phone: string | null }): DeliveryChannel | null {
  if (invitation.email) return "EMAIL";
  if (invitation.phone) return "SMS";
  return null;
}

export function buildInvitationDeliveryMessage(input: { eventName: string; firstName: string; link: string; channel: DeliveryChannel }) {
  const greeting = `Hi ${input.firstName},`;
  if (input.channel === "EMAIL") {
    return {
      subject: `You're invited to ${input.eventName}`,
      body: `${greeting}\n\nYou're invited to ${input.eventName}. Register with your secure link:\n${input.link}\n\nSee you there!`,
    };
  }
  return { subject: undefined, body: `${greeting} You're invited to ${input.eventName}. Register: ${input.link}` };
}

export type InvitationDeliveryInput = {
  organizationId: string;
  eventId: string;
  invitationId: string;
  actorId?: string | null;
  eventHostId?: string | null;
  firstName: string;
  email: string | null;
  phone: string | null;
  link: string;
  eventName: string;
};

// Sends (or, with the default log provider, simulates) invitee delivery for
// an invitation and records the attempt and its audit entry. Returns null
// when the invitation has no contact details to deliver to; the sender still
// has the copy-paste secure link either way, so this never blocks that flow.
export async function recordInvitationDelivery(input: InvitationDeliveryInput) {
  const channel = resolveInvitationDeliveryChannel({ email: input.email, phone: input.phone });
  if (!channel) return null;
  const recipient = channel === "EMAIL" ? input.email! : input.phone!;
  const provider = getDeliveryProvider(channel);
  const message = buildInvitationDeliveryMessage({ eventName: input.eventName, firstName: input.firstName, link: input.link, channel });

  let outcome: DeliveryResult;
  try {
    outcome = await provider.send({ channel, to: recipient, subject: message.subject, body: message.body });
  } catch (error) {
    outcome = { status: "FAILED", error: error instanceof Error ? error.message : "Delivery failed." };
  }

  return db.$transaction(async (tx) => {
    const attempt = await tx.deliveryAttempt.create({ data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      invitationId: input.invitationId,
      channel,
      provider: provider.name,
      recipient,
      status: outcome.status,
      providerMessageId: outcome.providerMessageId ?? null,
      error: outcome.error ?? null,
    } });
    await tx.auditLog.create({ data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorId: input.actorId ?? null,
      eventHostId: input.eventHostId ?? null,
      action: outcome.status === "SENT" ? "invitation.delivery_sent" : "invitation.delivery_failed",
      entityType: "DeliveryAttempt",
      entityId: attempt.id,
      newState: JSON.stringify({ invitationId: input.invitationId, channel, provider: provider.name, status: outcome.status }),
    } });
    return attempt;
  });
}
