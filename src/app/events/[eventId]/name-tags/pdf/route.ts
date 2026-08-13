import { getNameTagWorkspace } from "@/lib/name-tag-workspace";
import { parseNameTagAudience, renderNameTagsPdf } from "@/lib/name-tags";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const url = new URL(request.url);
  const audience = parseNameTagAudience({ audience: url.searchParams.get("audience") ?? undefined, groupId: url.searchParams.get("groupId") ?? undefined, tableId: url.searchParams.get("tableId") ?? undefined });
  const workspace = await getNameTagWorkspace(eventId, audience);
  if (!workspace) return new Response("Event not found.", { status: 404 });
  if (workspace.tags.length === 0) return new Response("No name tags match this audience.", { status: 400 });
  const bytes = await renderNameTagsPdf(workspace.event.name, workspace.tags);
  const filename = `${workspace.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event"}-name-tags.pdf`;
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
