import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const mode = process.argv[2];
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(".env"); } catch { /* Replit injects Secrets without a local .env file. */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Attach a Replit PostgreSQL database first.");
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error("unsupported protocol");
} catch {
  console.error("DATABASE_URL is not a valid PostgreSQL connection URL.");
  process.exit(1);
}

// Replit owns DATABASE_URL and may regenerate it without a schema parameter.
// Keep Gather isolated from Replit-managed objects in the public schema.
databaseUrl.searchParams.set("schema", "gather");
const env = { ...process.env, DATABASE_URL: databaseUrl.toString() };

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Replit can start a published revision without carrying the build artifact
// from its build phase. Keep startup self-healing while avoiding a redundant
// rebuild when .next/BUILD_ID is present as expected.
if (mode === "start" && !existsSync(".next/BUILD_ID")) {
  console.warn("Production build is missing; building before startup.");
  run("next", ["build"]);
}

run("prisma", ["migrate", "deploy"]);

if (mode === "seed") {
  run("tsx", ["prisma/seed.ts"]);
} else if (mode === "dev") {
  run("next", ["dev", "--hostname", "0.0.0.0", "--port", "3000"]);
} else if (mode === "start") {
  // Replit deployments use a separate production database. Keep the configured
  // administrator and organization present there before accepting traffic.
  run("tsx", ["prisma/seed.ts"]);
  run("next", ["start", "--hostname", "0.0.0.0", "--port", "3000"]);
} else {
  console.error(`Unknown Replit mode: ${mode ?? "(missing)"}`);
  process.exit(1);
}
