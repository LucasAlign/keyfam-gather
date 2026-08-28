import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status !== 0) throw new Error("Unable to list tracked files for secret scanning.");

const ignored = new Set([".env.example", "package-lock.json", "scripts/scan-secrets.ts"]);
const patterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bgh[oprsu]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
const findings: string[] = [];

for (const file of tracked.stdout.split("\0").filter(Boolean)) {
  if (ignored.has(file)) continue;
  let contents: string;
  try { contents = readFileSync(file, "utf8"); } catch { continue; }
  contents.split(/\r?\n/).forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) findings.push(`${file}:${index + 1}`);
  });
}

if (findings.length) {
  console.error(`Potential committed secrets found:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log("No high-confidence secrets found in tracked files.");
