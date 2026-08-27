import { describe, expect, it } from "vitest";
import { buildInvitationDeliveryMessage, resolveInvitationDeliveryChannel } from "./invitation-delivery";

describe("invitation delivery channel selection", () => {
  it("prefers email when both an email and a phone are present", () => {
    expect(resolveInvitationDeliveryChannel({ email: "guest@example.test", phone: "+15555550123" })).toBe("EMAIL");
  });

  it("falls back to SMS so the seam is architected email-first", () => {
    expect(resolveInvitationDeliveryChannel({ email: null, phone: "+15555550123" })).toBe("SMS");
  });

  it("returns null when there is no contact detail to deliver to", () => {
    expect(resolveInvitationDeliveryChannel({ email: null, phone: null })).toBeNull();
  });
});

describe("invitation delivery message templates", () => {
  it("builds an email with a subject and the secure link in the body", () => {
    const message = buildInvitationDeliveryMessage({ eventName: "Fall Gala", firstName: "Jordan", link: "https://gather.example/invite/abc123", channel: "EMAIL" });
    expect(message.subject).toContain("Fall Gala");
    expect(message.body).toContain("https://gather.example/invite/abc123");
    expect(message.body).toContain("Jordan");
  });

  it("builds a subject-less SMS body carrying the same link", () => {
    const message = buildInvitationDeliveryMessage({ eventName: "Fall Gala", firstName: "Jordan", link: "https://gather.example/invite/abc123", channel: "SMS" });
    expect(message.subject).toBeUndefined();
    expect(message.body).toContain("https://gather.example/invite/abc123");
  });
});
