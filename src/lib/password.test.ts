import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password and salts each hash uniquely", () => {
    const first = hashPassword("correct horse battery staple");
    const second = hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    expect(verifyPassword("correct horse battery staple", first)).toBe(true);
    expect(verifyPassword("correct horse battery staple", second)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("s3cret-password");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("rejects malformed or tampered stored values", () => {
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(verifyPassword("anything", "scrypt$16384$8$1$salt")).toBe(false);
    expect(verifyPassword("anything", "bcrypt$16384$8$1$c2FsdA$aGFzaA")).toBe(false);
  });
});
