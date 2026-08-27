import { NextResponse } from "next/server";

// Liveness probe: proves the process is up and event-looping. It deliberately
// touches no dependency, so an orchestrator never restarts a healthy instance
// just because Postgres is briefly unreachable — that is readiness' job.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
