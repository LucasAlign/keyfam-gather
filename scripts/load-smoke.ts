import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const target = process.env.LOAD_TARGET_URL?.replace(/\/$/, "");
assert(target, "Set LOAD_TARGET_URL to the deployed Gather origin.");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
const requests = Number(process.env.LOAD_REQUESTS ?? 200);
assert(Number.isInteger(concurrency) && concurrency > 0 && concurrency <= 200, "LOAD_CONCURRENCY must be between 1 and 200.");
assert(Number.isInteger(requests) && requests >= concurrency && requests <= 10000, "LOAD_REQUESTS must be between concurrency and 10000.");

async function main() {
  const timings: number[] = [];
  let next = 0;
  let failures = 0;
  async function worker() {
    while (next < requests) {
      next += 1;
      const started = performance.now();
      const response = await fetch(`${target}/health`, { cache: "no-store" }).catch(() => null);
      timings.push(performance.now() - started);
      if (!response?.ok) failures += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  timings.sort((a, b) => a - b);
  const percentile = (value: number) => timings[Math.min(timings.length - 1, Math.ceil(timings.length * value) - 1)];
  console.log(JSON.stringify({ target, requests, concurrency, failures, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), p99Ms: Math.round(percentile(0.99)) }, null, 2));
  assert.equal(failures, 0, `${failures} requests failed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
