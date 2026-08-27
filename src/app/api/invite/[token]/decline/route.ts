import { run } from "@/lib/api-response";
import { declineInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return run(() => declineInvitation(token));
}
