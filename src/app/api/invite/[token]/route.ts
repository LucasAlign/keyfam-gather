import { run } from "@/lib/api-response";
import { viewInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return run(() => viewInvitation(token));
}
