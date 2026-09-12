"use client";

import { useState } from "react";
import type { NameTagAudience } from "@/lib/name-tags";

type Option = { id: string; name: string };

export function NameTagControls({ audience, groups, tables }: { audience: NameTagAudience; groups: Option[]; tables: Option[] }) {
  const [kind, setKind] = useState<NameTagAudience["kind"]>(audience.kind);
  return <form className="name-tag-controls" method="get">
    <label>Audience<select name="audience" value={kind} onChange={(event) => setKind(event.target.value as NameTagAudience["kind"])}><option value="ALL">All registrants</option><option value="CHECKED_IN">Checked in</option><option value="NOT_CHECKED_IN">Not checked in</option><option value="HOSTS">Hosts</option><option value="WALK_INS">Walk-ins</option><option value="GROUP">Specific group</option><option value="TABLE">Specific table</option></select></label>
    {kind === "GROUP" && <label>Group<select name="groupId" defaultValue={audience.kind === "GROUP" ? audience.id : ""} required><option value="">Choose a group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
    {kind === "TABLE" && <label>Table<select name="tableId" defaultValue={audience.kind === "TABLE" ? audience.id : ""} required><option value="">Choose a table</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>}
    <button className="button secondary" type="submit">Update preview</button>
  </form>;
}
