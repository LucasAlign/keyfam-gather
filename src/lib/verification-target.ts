type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function assertGatherVerificationTarget(baseUrl: string, fetcher: Fetcher = fetch) {
  const origin = baseUrl.replace(/\/$/, "");
  try {
    const health = await fetcher(`${origin}/healthz`, { signal: AbortSignal.timeout(5_000) });
    const healthBody = health.ok ? await health.json() as { status?: string } : null;
    if (!health.ok || healthBody?.status !== "ok") throw new Error("liveness check failed");
    const readiness = await fetcher(`${origin}/readyz`, { signal: AbortSignal.timeout(5_000) });
    const readinessBody = readiness.ok ? await readiness.json() as { status?: string; database?: string } : null;
    if (!readiness.ok || readinessBody?.status !== "ready" || readinessBody.database !== "ok") throw new Error("readiness check failed");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown response";
    throw new Error(`GATHER_VERIFY_URL must point to a healthy Gather instance before fixtures are written (${origin}: ${detail}).`);
  }
}
