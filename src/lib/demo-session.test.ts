import { describe, expect, it } from "vitest";
import { createDemoSession, credentialsMatch, readDemoSession } from "./demo-session";

describe("development session", () => {
  it("round-trips a signed normalized identity", () => {
    const token = createDemoSession("Admin@Gather.Local", "test-secret");
    expect(readDemoSession(token, "test-secret")).toBe("admin@gather.local");
  });

  it("rejects tampered or incorrectly signed identities", () => {
    const token = createDemoSession("admin@gather.local", "test-secret");
    expect(readDemoSession(`${token}x`, "test-secret")).toBeNull();
    expect(readDemoSession(token, "other-secret")).toBeNull();
  });

  it("compares credentials without accepting prefixes", () => {
    expect(credentialsMatch("correct", "correct")).toBe(true);
    expect(credentialsMatch("correct", "correct-longer")).toBe(false);
  });
});
