import Link from "next/link";
import { notFound } from "next/navigation";
import { NameTagControls } from "@/components/name-tag-controls";
import { getNameTagWorkspace } from "@/lib/name-tag-workspace";
import { parseNameTagAudience } from "@/lib/name-tags";

export const dynamic = "force-dynamic";
type NameTagSearch = { audience?: string; groupId?: string; tableId?: string };

export default async function NameTagsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<NameTagSearch> }) {
  const { eventId } = await params;
  const audience = parseNameTagAudience(await searchParams);
  const workspace = await getNameTagWorkspace(eventId, audience);
  if (!workspace) notFound();
  const pdfQuery = new URLSearchParams({ audience: audience.kind });
  if (audience.kind === "GROUP" || audience.kind === "TABLE") pdfQuery.set(audience.kind === "GROUP" ? "groupId" : "tableId", audience.id);
  return <>
    <Link className="back" href={`/events/${eventId}`}>← {workspace.event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Name tags</p><h1>Prepare printable badges</h1><p>Select the right audience, inspect the first sheet, then generate an Avery 5395-compatible PDF.</p></div></div>
    <NameTagControls audience={audience} groups={workspace.groups} tables={workspace.tables} />
    <div className="name-tag-summary"><div><strong>{workspace.tags.length}</strong><span>badges selected</span></div><p>Avery 5395 · 2⅓″ × 3⅜″ · 8 per US Letter sheet</p>{workspace.tags.length > 0 && <a className="button" href={`/events/${eventId}/name-tags/pdf?${pdfQuery}`}>Generate printable PDF</a>}</div>
    <section><div className="section-heading"><h2>First-sheet preview</h2><span>{Math.min(workspace.tags.length, 8)}</span></div>{workspace.tags.length === 0 ? <div className="empty compact"><h3>No badges in this audience</h3><p>Choose another audience or add the missing group/table selection.</p></div> : <div className="name-tag-sheet">{workspace.tags.slice(0, 8).map((tag) => <article className="name-tag" key={tag.registrationId}><strong>{tag.fullName}</strong><span>{tag.detail}</span><small>{workspace.event.name}</small></article>)}</div>}{workspace.tags.length > 8 && <p className="form-hint">Previewing the first 8 of {workspace.tags.length} badges. The PDF contains {Math.ceil(workspace.tags.length / 8)} sheets.</p>}</section>
  </>;
}
