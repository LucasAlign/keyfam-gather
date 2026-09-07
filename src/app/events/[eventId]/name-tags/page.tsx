import Link from "next/link";
import { notFound } from "next/navigation";
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
    <form className="name-tag-controls" method="get">
      <label>Audience<select name="audience" defaultValue={audience.kind}><option value="ALL">All registrants</option><option value="CHECKED_IN">Checked in</option><option value="NOT_CHECKED_IN">Not checked in</option><option value="HOSTS">Hosts</option><option value="WALK_INS">Walk-ins</option><option value="GROUP">Specific group</option><option value="TABLE">Specific table</option></select></label>
      <label>Group<select name="groupId" defaultValue={audience.kind === "GROUP" ? audience.id : ""}><option value="">Choose a group</option>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label>Table<select name="tableId" defaultValue={audience.kind === "TABLE" ? audience.id : ""}><option value="">Choose a table</option>{workspace.tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
      <button className="button secondary" type="submit">Update preview</button>
    </form>
    <div className="name-tag-summary"><div><strong>{workspace.tags.length}</strong><span>badges selected</span></div><p>Avery 5395 · 2⅓″ × 3⅜″ · 8 per US Letter sheet</p>{workspace.tags.length > 0 && <a className="button" href={`/events/${eventId}/name-tags/pdf?${pdfQuery}`}>Generate printable PDF</a>}</div>
    <section><div className="section-heading"><h2>First-sheet preview</h2><span>{Math.min(workspace.tags.length, 8)}</span></div>{workspace.tags.length === 0 ? <div className="empty compact"><h3>No badges in this audience</h3><p>Choose another audience or add the missing group/table selection.</p></div> : <div className="name-tag-sheet">{workspace.tags.slice(0, 8).map((tag) => <article className="name-tag" key={tag.registrationId}><strong>{tag.fullName}</strong><span>{tag.detail}</span><small>{workspace.event.name}</small></article>)}</div>}{workspace.tags.length > 8 && <p className="form-hint">Previewing the first 8 of {workspace.tags.length} badges. The PDF contains {Math.ceil(workspace.tags.length / 8)} sheets.</p>}</section>
  </>;
}
