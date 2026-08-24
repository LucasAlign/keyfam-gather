import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger, serializeError } from "@/lib/logger";

// Readiness probe: reports whether this instance can serve traffic right now,
// which for Gather means Postgres is reachable. A 503 pulls the instance out of
// the load-balancer rotation without killing it, so it rejoins automatically
// once the database recovers.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ready", database: "ok", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("Readiness check failed", { ...serializeError(error), latencyMs: Date.now() - startedAt });
    return NextResponse.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
