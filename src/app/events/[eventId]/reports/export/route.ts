import { getEventReportWorkspace } from "@/lib/event-report-workspace";
import { renderReportCsv, reportKindSchema } from "@/lib/reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const parsed = reportKindSchema.safeParse(new URL(request.url).searchParams.get("report"));
  if (!parsed.success) return new Response("Unknown report.", { status: 400 });
  const workspace = await getEventReportWorkspace(eventId);
  if (!workspace) return new Response("Event not found.", { status: 404 });
  const filenameBase = workspace.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  return new Response(renderReportCsv(workspace.report, parsed.data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filenameBase}-${parsed.data}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
