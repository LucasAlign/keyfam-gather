import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Reversible encryption-at-rest for bearer tokens (currently host portal
// links). Tokens are still looked up by their SHA-256 hash; this stores a
// second, decrypt-only copy so authorized staff can recover and re-share the
// existing link without rotating it (issue #9). A database dump alone cannot
// derive a link — decryption requires the server's AUTH_SESSION_SECRET — so the
// "digest only" security posture is preserved against at-rest exposure.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class TokenCipherError extends Error {}

function deriveKey(secret: string) {
  return createHash("sha256").update(`gather:token-cipher:${secret}`).digest();
}

export function tokenEncryptionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET ?? process.env.DEMO_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new TokenCipherError("Token encryption is not configured.");
  return secret;
}

export function encryptWithKey(key: Buffer, plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function decryptWithKey(key: Buffer, payload: string) {
  const [version, encoded] = payload.split(":");
  if (version !== VERSION || !encoded) throw new TokenCipherError("Unrecognized token payload.");
  const raw = Buffer.from(encoded, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new TokenCipherError("Malformed token payload.");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenCipherError("Token could not be decrypted.");
  }
}

export function encryptToken(plaintext: string) {
  return encryptWithKey(deriveKey(tokenEncryptionSecret()), plaintext);
}

export function decryptToken(payload: string) {
  return decryptWithKey(deriveKey(tokenEncryptionSecret()), payload);
}
