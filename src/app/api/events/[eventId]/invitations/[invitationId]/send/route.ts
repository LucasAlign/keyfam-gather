import { mapError, ok } from "@/lib/api-response";
import { sendInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string; invitationId: string }> }) {
  const { eventId, invitationId } = await params;
  try {
    const { invitation, token, invitePath } = await sendInvitation(eventId, invitationId);
    // The one-time token is returned as an absolute, shareable URL built from this origin.
    const inviteUrl = new URL(invitePath, request.url).toString();
    return ok({ invitation, token, inviteUrl });
  } catch (error) {
    return mapError(error);
  }
}
