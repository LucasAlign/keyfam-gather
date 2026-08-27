import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing using Node's built-in scrypt (no native dependency). Stored
// format is self-describing so cost parameters can evolve without a data migration:
//   scrypt$<N>$<r>$<p>$<salt-base64url>$<hash-base64url>
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: DEFAULT_N, r: DEFAULT_R, p: DEFAULT_P, maxmem: MAX_MEMORY });
  return `scrypt$${DEFAULT_N}$${DEFAULT_R}$${DEFAULT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(rawSalt, "base64url");
    expected = Buffer.from(rawHash, "base64url");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, expected.length, { N, r, p, maxmem: MAX_MEMORY });
  } catch {
    return false;
  }
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
