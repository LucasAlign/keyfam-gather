import QRCode from "qrcode";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { isPublic: true } });
  if (!event?.isPublic) return new Response("Public registration is not available.", { status: 404 });
  const registrationUrl = new URL(`/events/${eventId}/public-register`, request.url).toString();
  const svg = await QRCode.toString(registrationUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 480 });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `inline; filename="gather-registration-${eventId}.svg"`, "Cache-Control": "private, no-store" } });
}
