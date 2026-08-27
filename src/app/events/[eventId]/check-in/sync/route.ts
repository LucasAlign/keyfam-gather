import { NextResponse } from "next/server";
import { applyAttendanceCommands } from "@/lib/attendance";
import { attendanceBatchSchema } from "@/lib/attendance-contract";
import { logger } from "@/lib/logger";
import { consumeIpRateLimit } from "@/lib/rate-limit-request";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const limit = consumeIpRateLimit(request.headers, "checkin-sync", 300, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const parsed = attendanceBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.some((command) => command.eventId !== eventId)) {
    return NextResponse.json({ error: "Invalid attendance command batch." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const startedAt = Date.now();
  const results = await applyAttendanceCommands(parsed.data);
  // Per-batch throughput and disposition mix — the signal that reveals whether a
  // device is retrying against conflicts (rising CONFLICT/partial-ack) during a
  // busy check-in, without logging any attendee data.
  const dispositions: Record<string, number> = {};
  for (const result of results) dispositions[result.disposition] = (dispositions[result.disposition] ?? 0) + 1;
  logger.info("Attendance batch applied", { eventId, received: parsed.data.length, applied: results.length, dispositions, durationMs: Date.now() - startedAt });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
