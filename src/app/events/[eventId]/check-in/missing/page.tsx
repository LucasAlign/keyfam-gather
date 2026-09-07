import Link from "next/link";
import { notFound } from "next/navigation";
import { MissingGuestWalkInForm } from "@/components/missing-guest-walk-in-form";
import { requireActor } from "@/lib/auth";
import { getMissingGuestWorkspace } from "@/lib/event-missing-guest";

export const dynamic = "force-dynamic";
export default async function MissingGuestPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { eventId } = await params; const { q = "" } = await searchParams; let workspace; try { workspace = await getMissingGuestWorkspace(eventId, q); } catch { notFound(); }
  const access = await requireActor(workspace.event.organizationId, "checkin:manage", eventId); const canApprove = access.can("walkin:manage");
  return <div className="narrow"><Link className="back" href={`/events/${eventId}/check-in`}>← Check-in</Link><p className="eyebrow">Missing guest assistant</p><h1>Find the safest resolution</h1><p className="lede">Search the guest, Host, Group, Party, or Table they mention. Existing Registrations appear first to prevent duplicates.</p><form method="get" className="form-card"><label>What did the guest tell you?<input name="q" defaultValue={q} placeholder="Sam Lee or Smith Group" autoFocus required /></label><button className="button">Search Event context</button></form>{q && <section className="event-section missing-results"><div className="section-heading"><h2>Likely context</h2><span>{workspace.results.length}</span></div>{workspace.results.length ? workspace.results.map((item) => <article key={`${item.kind}:${item.id}`}><span className="status">{item.kind.toLowerCase()}</span><div><strong>{item.label}</strong><p>{item.detail}</p>{item.kind === "REGISTRATION" && <Link href={`/events/${eventId}/check-in?q=${encodeURIComponent(item.label)}`}>Return to this Registration in check-in</Link>}</div><small>Evidence score {item.score}</small></article>) : <div className="empty compact"><h3>No likely context found</h3><p>Confirm the spelling and ask which Host, Group, or Table invited the guest before creating a walk-in.</p></div>}</section>}<MissingGuestWalkInForm eventId={eventId} canApprove={canApprove} groups={workspace.groups} tables={workspace.tables} /></div>;
}
