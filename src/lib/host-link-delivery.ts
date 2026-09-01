import type { DeliveryChannel } from "@/lib/delivery";

export function resolveHostDeliveryChannel(contact: { email: string | null; phone: string | null }): DeliveryChannel | null {
  if (contact.email) return "EMAIL";
  if (contact.phone) return "SMS";
  return null;
}

export function buildHostLinkMessage(input: { eventName: string; firstName: string; link: string; channel: DeliveryChannel }) {
  const greeting = `Hi ${input.firstName},`;
  if (input.channel === "EMAIL") {
    return {
      subject: `Your host link for ${input.eventName}`,
      body: `${greeting}\n\nHere is your private host link for ${input.eventName}. Use it to manage your group and guests:\n${input.link}\n\nKeep it private — it works like a password.`,
    };
  }
  return { subject: undefined, body: `${greeting} Your host link for ${input.eventName}: ${input.link} (keep it private).` };
}

// Partially hide a recipient so a resend confirmation can name where the link
// went without echoing the full address back into the UI.
export function maskRecipient(value: string) {
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    const shown = local.slice(0, 1);
    return `${shown}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }
  const digits = value.replace(/\D/g, "");
  const last = digits.slice(-4);
  return last ? `•••• ${last}` : "the number on file";
}
