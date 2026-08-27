import { readJson, run } from "@/lib/api-response";
import { registerFromInvitation } from "@/lib/invitation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  return run(() => registerFromInvitation(token, body), 201);
}
