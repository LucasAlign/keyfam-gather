import { run } from "@/lib/api-response";
import { cancelHostInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string; invitationId: string }> }) {
  const { token, invitationId } = await params;
  return run(() => cancelHostInvitation(token, invitationId));
}
