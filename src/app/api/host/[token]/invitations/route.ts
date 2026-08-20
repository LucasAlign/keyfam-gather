import { mapError, ok, readJson } from "@/lib/api-response";
import { createHostInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  try {
    const { invitation, token: inviteToken, invitePath } = await createHostInvitation(token, body);
    const inviteUrl = new URL(invitePath, request.url).toString();
    return ok({ invitation, token: inviteToken, inviteUrl }, 201);
  } catch (error) {
    return mapError(error);
  }
}
