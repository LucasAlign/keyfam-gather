import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");

const root = process.cwd();
const distDir = ".next-verify";
const verifyTsconfig = ".next-verify-tsconfig.json";
const nextEnvPath = join(root, "next-env.d.ts");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const tsxBin = join(root, "node_modules", "tsx", "dist", "cli.mjs");

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} exited with ${signal ?? code}.`));
    });
  });
}

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a verification port."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitUntilReady(url: string, server: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Verification server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(`${url}/login`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Verification server did not become ready within 30 seconds.");
}

async function verifyHttpBoundary(url: string) {
  const home = await fetch(`${url}/`, { redirect: "manual" });
  const homeBody = await home.text();
  const redirectsToLogin = home.headers.get("location") === "/login" || homeBody.includes("/login");
  if (!redirectsToLogin || homeBody.includes("Something didn’t go as planned")) {
    throw new Error("Expected unauthenticated / to redirect to /login without rendering the global error UI.");
  }
  const login = await fetch(`${url}/login`, { redirect: "manual" });
  const expected = new Map([
    ["referrer-policy", "no-referrer"],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    // camera=(self) is intentional: the QR check-in scanner uses the camera on
    // the operator's own origin. microphone/geolocation stay fully disabled.
    ["permissions-policy", "camera=(self), microphone=(), geolocation=()"],
  ]);
  for (const [header, value] of expected) {
    if (login.headers.get(header) !== value) throw new Error(`Expected ${header}: ${value} on the production HTTP boundary.`);
  }
  for (const path of ["/host/invalid-token", "/invite/invalid-token"]) {
    const response = await fetch(`${url}${path}`, { redirect: "manual" });
    if (!response.headers.get("cache-control")?.includes("no-store")) throw new Error(`Expected a no-store cache policy on ${path}.`);
  }
}

// `next build` manages next-env.d.ts automatically, creating it if absent.
// On a fresh checkout (e.g. a CI job that never ran `next dev`/`next build`
// beforehand) it does not exist yet, so this must not assume it does.
async function readIfExists(path: string) {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NEXT_DIST_DIR: distDir, NEXT_TSCONFIG_PATH: verifyTsconfig };
  let server: ChildProcess | undefined;
  const nextEnvBefore = await readIfExists(nextEnvPath);
  let nextEnvAfterBuild: string | undefined;

  await rm(join(root, distDir), { recursive: true, force: true });
  await copyFile(join(root, "tsconfig.json"), join(root, verifyTsconfig));
  try {
    await run(process.execPath, [nextBin, "build"], env);
    nextEnvAfterBuild = (await readIfExists(nextEnvPath)) ?? undefined;
    server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: root,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    await waitUntilReady(baseUrl, server);
    await verifyHttpBoundary(baseUrl);
    await run(process.execPath, [tsxBin, "scripts/verify-postgres.ts"], { ...env, GATHER_VERIFY_URL: baseUrl });
  } finally {
    server?.kill();
    await rm(join(root, distDir), { recursive: true, force: true });
    await rm(join(root, verifyTsconfig), { force: true });
    const currentNextEnv = await readIfExists(nextEnvPath);
    if (!nextEnvAfterBuild || currentNextEnv === nextEnvAfterBuild) {
      if (nextEnvBefore === null) await rm(nextEnvPath, { force: true });
      else await writeFile(nextEnvPath, nextEnvBefore);
    } else {
      console.warn("next-env.d.ts changed during verification; preserving the newer contents.");
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
