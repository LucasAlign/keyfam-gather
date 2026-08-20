import { mapError, ok } from "@/lib/api-response";
import { resendHostInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string; invitationId: string }> }) {
  const { token, invitationId } = await params;
  try {
    const { invitation, token: inviteToken, invitePath } = await resendHostInvitation(token, invitationId);
    const inviteUrl = new URL(invitePath, request.url).toString();
    return ok({ invitation, token: inviteToken, inviteUrl });
  } catch (error) {
    return mapError(error);
  }
}
