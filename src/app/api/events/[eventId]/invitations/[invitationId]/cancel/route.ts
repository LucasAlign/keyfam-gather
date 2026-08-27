import { run } from "@/lib/api-response";
import { cancelInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ eventId: string; invitationId: string }> }) {
  const { eventId, invitationId } = await params;
  return run(() => cancelInvitation(eventId, invitationId));
}
