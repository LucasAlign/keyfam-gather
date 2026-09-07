import { describe, expect, it } from "vitest";
import { buildHostLinkMessage, maskRecipient, resolveHostDeliveryChannel } from "./host-link-delivery";

describe("host link delivery helpers", () => {
  it("prefers email, falls back to phone, and returns null with neither", () => {
    expect(resolveHostDeliveryChannel({ email: "h@example.com", phone: "123" })).toBe("EMAIL");
    expect(resolveHostDeliveryChannel({ email: null, phone: "123" })).toBe("SMS");
    expect(resolveHostDeliveryChannel({ email: null, phone: null })).toBeNull();
  });

  it("builds an email message with a subject and an SMS message without one", () => {
    const email = buildHostLinkMessage({ eventName: "Gala", firstName: "Sam", link: "https://x/host/tok", channel: "EMAIL" });
    expect(email.subject).toContain("Gala");
    expect(email.body).toContain("https://x/host/tok");
    const sms = buildHostLinkMessage({ eventName: "Gala", firstName: "Sam", link: "https://x/host/tok", channel: "SMS" });
    expect(sms.subject).toBeUndefined();
    expect(sms.body).toContain("https://x/host/tok");
  });

  it("masks email and phone recipients", () => {
    expect(maskRecipient("hostperson@example.com")).toBe("h*********@example.com");
    expect(maskRecipient("+1 (212) 555-0142")).toBe("•••• 0142");
  });
});
