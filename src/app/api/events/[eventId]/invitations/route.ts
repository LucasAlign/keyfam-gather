import { readJson, run } from "@/lib/api-response";
import { createInvitationDraft, listInvitations } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return run(() => listInvitations(eventId, status));
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await readJson(request);
  return run(() => createInvitationDraft(eventId, body), 201);
}
