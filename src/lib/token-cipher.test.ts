import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWithKey, encryptWithKey, TokenCipherError } from "./token-cipher";

const key = createHash("sha256").update("test-token-cipher-key").digest();

describe("token cipher", () => {
  it("round-trips a token through encryption", () => {
    const token = "abc123_secure-host-token";
    const payload = encryptWithKey(key, token);
    expect(payload).not.toContain(token);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(decryptWithKey(key, payload)).toBe(token);
  });

  it("produces a distinct ciphertext each time (random IV)", () => {
    expect(encryptWithKey(key, "same")).not.toBe(encryptWithKey(key, "same"));
  });

  it("rejects tampered ciphertext via the auth tag", () => {
    const payload = encryptWithKey(key, "trusted-token");
    const raw = Buffer.from(payload.slice(3), "base64url");
    raw[raw.length - 1] ^= 0xff; // flip a ciphertext bit
    const tampered = `v1:${raw.toString("base64url")}`;
    expect(() => decryptWithKey(key, tampered)).toThrow(TokenCipherError);
  });

  it("rejects a payload encrypted under a different key", () => {
    const other = createHash("sha256").update("a-different-key").digest();
    const payload = encryptWithKey(other, "token");
    expect(() => decryptWithKey(key, payload)).toThrow(TokenCipherError);
  });

  it("rejects an unrecognized version or malformed payload", () => {
    expect(() => decryptWithKey(key, "v2:abcd")).toThrow(TokenCipherError);
    expect(() => decryptWithKey(key, "not-a-payload")).toThrow(TokenCipherError);
  });
});
