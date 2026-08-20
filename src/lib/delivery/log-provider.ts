import type { DeliveryProvider } from "./types";

// Redacts a recipient address/number to non-identifying shape for logs. This
// exists specifically so the default provider can confirm dispatch without
// ever printing contact details or (critically) the message body, which may
// embed a secure, single-reveal invitation link.
function redactRecipient(to: string) {
  const at = to.indexOf("@");
  if (at > 1) return `${to.slice(0, 2)}***${to.slice(at)}`;
  if (to.length > 4) return `${to.slice(0, 2)}***${to.slice(-2)}`;
  return "***";
}

// Default provider when no real email/SMS integration is configured. It
// performs no network call and never logs a message body or link, only
// enough metadata for a developer to confirm delivery was attempted.
export const logDeliveryProvider: DeliveryProvider = {
  name: "log",
  async send(message) {
    console.info(`[delivery:log] ${message.channel} -> ${redactRecipient(message.to)}${message.subject ? ` "${message.subject}"` : ""} (${message.body.length} chars)`);
    return { status: "SENT" };
  },
};
