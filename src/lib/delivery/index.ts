import type { DeliveryChannel, DeliveryProvider } from "./types";
import { logDeliveryProvider } from "./log-provider";

export type { DeliveryChannel, DeliveryMessage, DeliveryProvider, DeliveryResult, DeliveryStatus } from "./types";
export { logDeliveryProvider } from "./log-provider";

// Provider registries keyed by a short, env-selectable name. A real
// integration (Resend/Postmark/SES for email, Twilio for SMS) registers here
// under its own key without changing any call site; EMAIL_DELIVERY_PROVIDER /
// SMS_DELIVERY_PROVIDER select which one is active, defaulting to "log" since
// no provider credentials exist in every environment.
const emailProviders: Record<string, DeliveryProvider> = { log: logDeliveryProvider };
const smsProviders: Record<string, DeliveryProvider> = { log: logDeliveryProvider };

export function getDeliveryProvider(channel: DeliveryChannel): DeliveryProvider {
  const registry = channel === "EMAIL" ? emailProviders : smsProviders;
  const envVar = channel === "EMAIL" ? process.env.EMAIL_DELIVERY_PROVIDER : process.env.SMS_DELIVERY_PROVIDER;
  const key = (envVar ?? "log").trim().toLowerCase();
  const provider = registry[key];
  if (!provider) throw new Error(`Unknown ${channel.toLowerCase()} delivery provider "${key}".`);
  return provider;
}
