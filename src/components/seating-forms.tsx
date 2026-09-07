"use client";

import { useActionState, useState } from "react";
import { createParty, createSeatingTable, createSeatingTables, moveSeating, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { bulkTableNames, duplicateTableNames } from "@/lib/seating";

type NamedOption = { id: string; name: string };
type RegistrantOption = NamedOption & { detail: string };

export function TableForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createSeatingTable, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h2>Create a table</h2><div className="field-row"><label>Name or number<input name="name" required />{error("name") && <small>{error("name")}</small>}</label><label>Capacity<input name="capacity" type="number" min="1" required />{error("capacity") && <small>{error("capacity")}</small>}</label></div><label>Notes<textarea name="notes" rows={2} /></label><SubmitButton pendingText="Creating table…">Create table</SubmitButton></form>;
}

export function BulkTableForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createSeatingTables, {} as ActionState);
  // Live preview: mirror the exact names the server action will write so the
  // coordinator reviews every Table before creating a large range (issue #13).
  const [count, setCount] = useState(25);
  const [startingNumber, setStartingNumber] = useState(1);
  const [namePattern, setNamePattern] = useState("Table {n}");
  const [capacity, setCapacity] = useState(10);
  const error = (name: string) => state.fields?.[name]?.[0];
  const clampedCount = Number.isFinite(count) ? Math.max(0, Math.min(Math.floor(count), 500)) : 0;
  const names = bulkTableNames({ count: clampedCount, startingNumber, namePattern });
  const duplicates = duplicateTableNames(names);
  const missingToken = namePattern.length > 0 && !namePattern.includes("{n}") && clampedCount > 1;
  const previewCap = 60;
  return <form action={action} className="form-card compact-form">
    <input type="hidden" name="eventId" value={eventId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    {state.success && <div className="success" role="status">{state.success}</div>}
    <h2>Generate Tables</h2>
    <p className="form-hint">Use <code>{`{n}`}</code> in the pattern where the number should appear. Existing names stop the whole operation before anything changes.</p>
    <div className="field-row"><label>Count<input name="count" type="number" min="1" max="500" value={Number.isNaN(count) ? "" : count} onChange={(event) => setCount(event.target.valueAsNumber)} required />{error("count") && <small>{error("count")}</small>}</label><label>Starting number<input name="startingNumber" type="number" min="0" value={Number.isNaN(startingNumber) ? "" : startingNumber} onChange={(event) => setStartingNumber(event.target.valueAsNumber)} required />{error("startingNumber") && <small>{error("startingNumber")}</small>}</label></div>
    <div className="field-row"><label>Naming pattern<input name="namePattern" value={namePattern} onChange={(event) => setNamePattern(event.target.value)} required />{error("namePattern") && <small>{error("namePattern")}</small>}</label><label>Seats per Table<input name="capacity" type="number" min="1" value={Number.isNaN(capacity) ? "" : capacity} onChange={(event) => setCapacity(event.target.valueAsNumber)} required />{error("capacity") && <small>{error("capacity")}</small>}</label></div>
    <div className="table-preview" aria-live="polite">
      <div className="table-preview-head"><strong>Preview</strong><span>{names.length} {names.length === 1 ? "Table" : "Tables"}{names.length ? ` · ${Number.isFinite(capacity) && capacity > 0 ? capacity : 0} seats each` : ""}</span></div>
      {missingToken && <p className="preview-warning">Add <code>{`{n}`}</code> to the pattern — without it every Table gets the same name.</p>}
      {duplicates.length > 0 && !missingToken && <p className="preview-warning">This range repeats: {duplicates.slice(0, 5).join(", ")}{duplicates.length > 5 ? "…" : ""}.</p>}
      {names.length === 0
        ? <p className="form-hint">Enter a count to preview the Tables.</p>
        : <ul className="table-preview-list">{names.slice(0, previewCap).map((name, index) => <li key={index}>{name}</li>)}{names.length > previewCap && <li className="preview-more">+{names.length - previewCap} more</li>}</ul>}
    </div>
    <SubmitButton pendingText="Creating Tables…">Create {names.length || ""} reviewed {names.length === 1 ? "Table" : "Tables"}</SubmitButton>
  </form>;
}

export function PartyForm({ eventId, registrations }: { eventId: string; registrations: RegistrantOption[] }) {
  const [state, action] = useActionState(createParty, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h2>Create a party</h2><label>Party name<input name="name" required placeholder="Smith Party" />{error("name") && <small>{error("name")}</small>}</label><fieldset><legend>People moving together</legend><div className="check-list">{registrations.map((item) => <label className="choice" key={item.id}><input type="checkbox" name="registrationIds" value={item.id} /> <span>{item.name}<small>{item.detail}</small></span></label>)}</div>{error("registrationIds") && <small>{error("registrationIds")}</small>}</fieldset><SubmitButton pendingText="Creating party…">Create party</SubmitButton></form>;
}

export function MoveForm({ eventId, sourceType, sources, tables, title }: { eventId: string; sourceType: "registration" | "group" | "party"; sources: NamedOption[]; tables: NamedOption[]; title: string }) {
  const [state, action] = useActionState(moveSeating, {} as ActionState);
  return <form action={action} className="move-form"><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="sourceType" value={sourceType} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h3>{title}</h3><label>{sourceType === "registration" ? "Registrant" : sourceType === "group" ? "Group" : "Party"}<select name="sourceId" required defaultValue=""><option value="">Choose one</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label><label>Destination<select name="tableId" defaultValue=""><option value="">Unassigned</option>{tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label><label className="choice override"><input type="checkbox" name="overrideCapacity" /> Allow this move over capacity</label><SubmitButton pendingText="Moving…">Update seating</SubmitButton></form>;
}
