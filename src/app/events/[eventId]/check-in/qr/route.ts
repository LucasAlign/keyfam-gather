import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveActiveCheckInToken } from "@/lib/checkin-token-management";
import { consumeIpRateLimit } from "@/lib/rate-limit-request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1).max(600) });

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const limit = consumeIpRateLimit(request.headers, "checkin-qr", 120, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That QR code could not be read." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) {
    return NextResponse.json({ error: "This event is not available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    await requireActor(event.organizationId, "checkin:manage", eventId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
  const resolved = await resolveActiveCheckInToken({ token: parsed.data.token, organizationId: event.organizationId, eventId });
  if (!resolved) {
    return NextResponse.json({ error: "This QR code is not valid for this event." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ registrationId: resolved.registrationId }, { headers: { "Cache-Control": "no-store" } });
}
