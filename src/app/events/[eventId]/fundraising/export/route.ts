import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

function csv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { fundraisingCommitments: { include: { person: true, group: true, sponsorship: { include: { sponsor: true } }, transactions: true }, orderBy: { committedAt: "desc" } } } });
  if (!event) return new Response("Event not found", { status: 404 });
  await requireActor(event.organizationId, "event:view", eventId);
  const header = ["type", "status", "sponsor", "person", "group", "description", "committed", "payments", "refunds", "net received", "outstanding", "currency"];
  const rows = event.fundraisingCommitments.map((item) => {
    const payments = item.transactions.filter((transaction) => transaction.kind === "PAYMENT").reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const refunds = item.transactions.filter((transaction) => transaction.kind === "REFUND").reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const received = payments - refunds;
    return [item.kind, item.status, item.sponsorship?.sponsor.name, item.person ? `${item.person.firstName} ${item.person.lastName}` : "", item.group?.name, item.description, item.amountCents / 100, payments / 100, refunds / 100, received / 100, Math.max(item.amountCents - received, 0) / 100, event.currency];
  });
  return new Response([header, ...rows].map((row) => row.map(csv).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${event.name.replaceAll('"', "")}-fundraising.csv"` } });
}
