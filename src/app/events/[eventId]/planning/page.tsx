import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { EventPlanning } from "@/components/event-planning";

export default async function PlanningPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, status: true, currency: true, budgetCents: true, expenses: { orderBy: [{ category: "asc" }, { id: "asc" }] }, quickLinks: { orderBy: [{ title: "asc" }, { id: "asc" }] } } });
  if (!event) notFound();
  await requireActor(event.organizationId, "event:manage", eventId);
  return <><div className="page-heading"><div><p className="eyebrow">Planning / Resources</p><h1>Budget & documents</h1><p>Keep costs, vendors, and event documents together.</p></div></div><EventPlanning eventId={eventId} currency={event.currency} budgetCents={event.budgetCents} expenses={event.expenses} links={event.quickLinks} editable={event.status !== "ARCHIVED"} /></>;
}
