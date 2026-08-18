import { describe, expect, it } from "vitest";
import { createSession, readSession } from "./session";

describe("session cookie", () => {
  it("round-trips a signed, normalized identity and version", () => {
    const token = createSession({ email: "Admin@Gather.Local", version: 3 }, "test-secret-value");
    expect(readSession(token, "test-secret-value")).toEqual({ email: "admin@gather.local", version: 3 });
  });

  it("rejects tampered payloads and mismatched secrets", () => {
    const token = createSession({ email: "admin@gather.local", version: 1 }, "test-secret-value");
    expect(readSession(`${token}x`, "test-secret-value")).toBeNull();
    expect(readSession(token, "other-secret-value")).toBeNull();
    expect(readSession(undefined, "test-secret-value")).toBeNull();
  });

  it("preserves the session version so it can be checked against the user", () => {
    const token = createSession({ email: "admin@gather.local", version: 7 }, "test-secret-value");
    const session = readSession(token, "test-secret-value");
    expect(session?.version).toBe(7);
  });
});
