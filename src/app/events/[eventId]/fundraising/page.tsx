import Link from "next/link";
import { notFound } from "next/navigation";
import { CommitmentForm, FundraisingGoalForm, TransactionForm } from "@/components/fundraising-forms";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, summarizeFundraising } from "@/lib/fundraising";

export const dynamic = "force-dynamic";

export default async function FundraisingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { fundraisingCommitments: { include: { transactions: { orderBy: { occurredAt: "asc" } }, person: { select: { firstName: true, lastName: true } } }, orderBy: { committedAt: "desc" } } } });
  if (!event) notFound();
  const access = await requireActor(event.organizationId, "event:view", eventId);
  const summary = summarizeFundraising({ goalCents: event.fundraisingGoalCents, commitments: event.fundraisingCommitments });
  const money = (cents: number) => formatMoney(cents, event.currency);
  return <>
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Fundraising</p><h1>Fundraising ledger</h1><p>Track commitments separately from cash received so leadership always sees an honest total.</p></div></div>
    <section className="metrics fundraising-metrics" aria-label="Fundraising totals"><div><strong>{summary.goalCents === null ? "—" : money(summary.goalCents)}</strong><span>Goal</span></div><div><strong>{money(summary.committedCents)}</strong><span>Committed</span></div><div><strong>{money(summary.receivedCents)}</strong><span>Received</span></div><div><strong>{money(summary.outstandingCents)}</strong><span>Outstanding</span></div><div><strong>{summary.remainingToGoalCents === null ? "—" : money(summary.remainingToGoalCents)}</strong><span>Goal remaining</span></div></section>
    {access.can("fundraising:manage") && event.status !== "ARCHIVED" && <div className="fundraising-forms"><FundraisingGoalForm eventId={eventId} goalCents={event.fundraisingGoalCents} /><CommitmentForm eventId={eventId} /><TransactionForm eventId={eventId} commitments={event.fundraisingCommitments.filter((item) => item.status === "ACTIVE").map((item) => ({ id: item.id, label: `${item.kind.replaceAll("_", " ")} · ${money(item.amountCents)}${item.description ? ` · ${item.description}` : ""}` }))} /></div>}
    <section className="event-section"><div className="section-heading"><h2>Commitments</h2><span>{event.fundraisingCommitments.length}</span></div>{event.fundraisingCommitments.length === 0 ? <div className="empty compact"><h3>No fundraising recorded</h3><p>Add a Donation, Pledge, Sponsorship, or ticket commitment to begin.</p></div> : <div className="report-table fundraising-table"><div className="report-table-head"><span>Type</span><span>Amount</span><span>Received</span><span>Outstanding</span></div>{event.fundraisingCommitments.map((item) => { const received = item.transactions.reduce((sum, transaction) => sum + (transaction.kind === "PAYMENT" ? transaction.amountCents : -transaction.amountCents), 0); return <div key={item.id}><strong>{item.kind.replaceAll("_", " ")}<small>{item.description || (item.person ? `${item.person.firstName} ${item.person.lastName}` : "")}</small></strong><span>{money(item.amountCents)}</span><span>{money(received)}</span><span>{money(Math.max(item.amountCents - received, 0))}</span></div>; })}</div>}</section>
  </>;
}
