import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeliveryProvider } from "./index";
import { logDeliveryProvider } from "./log-provider";

describe("delivery provider selection", () => {
  const originalEmail = process.env.EMAIL_DELIVERY_PROVIDER;
  const originalSms = process.env.SMS_DELIVERY_PROVIDER;
  afterEach(() => {
    process.env.EMAIL_DELIVERY_PROVIDER = originalEmail;
    process.env.SMS_DELIVERY_PROVIDER = originalSms;
  });

  it("defaults to the log provider for email and SMS when no env var is set", () => {
    delete process.env.EMAIL_DELIVERY_PROVIDER;
    delete process.env.SMS_DELIVERY_PROVIDER;
    expect(getDeliveryProvider("EMAIL")).toBe(logDeliveryProvider);
    expect(getDeliveryProvider("SMS")).toBe(logDeliveryProvider);
  });

  it("selects by env var, case-insensitively", () => {
    process.env.EMAIL_DELIVERY_PROVIDER = "LOG";
    expect(getDeliveryProvider("EMAIL")).toBe(logDeliveryProvider);
  });

  it("rejects an unknown provider name rather than silently falling back", () => {
    process.env.EMAIL_DELIVERY_PROVIDER = "not-a-real-provider";
    expect(() => getDeliveryProvider("EMAIL")).toThrow(/Unknown email delivery provider/);
  });
});

describe("log delivery provider", () => {
  it("reports success without calling any external network", async () => {
    const result = await logDeliveryProvider.send({ channel: "EMAIL", to: "guest@example.test", subject: "Hi", body: "https://gather.example/invite/super-secret-token" });
    expect(result).toEqual({ status: "SENT" });
  });

  it("never logs the raw message body or a secure link/token", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const secret = "super-secret-token-value";
    await logDeliveryProvider.send({ channel: "EMAIL", to: "guest@example.test", subject: "You're invited", body: `Register here: https://gather.example/invite/${secret}` });
    const logged = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(secret);
    expect(logged).toContain("EMAIL");
    spy.mockRestore();
  });

  it("redacts email and phone recipients", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await logDeliveryProvider.send({ channel: "EMAIL", to: "jordan@example.test", body: "x" });
    await logDeliveryProvider.send({ channel: "SMS", to: "+15555550123", body: "x" });
    const logged = spy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain("jordan@example.test");
    expect(logged).not.toContain("+15555550123");
    spy.mockRestore();
  });
});
