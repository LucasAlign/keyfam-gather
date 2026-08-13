import { NextResponse } from "next/server";
import { applyAttendanceCommands } from "@/lib/attendance";
import { attendanceBatchSchema } from "@/lib/attendance-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const parsed = attendanceBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.some((command) => command.eventId !== eventId)) {
    return NextResponse.json({ error: "Invalid attendance command batch." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const results = await applyAttendanceCommands(parsed.data);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
