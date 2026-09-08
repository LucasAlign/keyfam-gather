"use client";
import type { EventRegistrationField, EventRegistrationFieldOption } from "@prisma/client";
import { useActionState, useState } from "react";
import { createRegistrationField, retireRegistrationField } from "@/app/registration-field-actions";
import { SubmitButton } from "@/components/submit-button";
import { slugifyFieldKey } from "@/lib/registration-fields";
type Field = EventRegistrationField & { options: EventRegistrationFieldOption[] };

function AddFieldForm({ eventId }: { eventId: string }) {
  const [createState, createAction] = useActionState(createRegistrationField, {});
  // Auto-derive the stable key from the label until a coordinator edits the key
  // directly; from then on their key is left alone. On a failed submit the
  // action echoes what was typed, so seed from that.
  const [label, setLabel] = useState(createState.values?.label ?? "");
  const [key, setKey] = useState(createState.values?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(Boolean(createState.values?.key));
  const shownKey = keyEdited ? key : slugifyFieldKey(label);
  return <form key={createState.token ?? "initial"} action={createAction} className="nested-form"><h3>Add a field</h3>
    {createState.error && <div className="alert" role="alert">{createState.error}</div>}
    {createState.success && <div className="success" role="status">{createState.success}</div>}
    <input type="hidden" name="eventId" value={eventId}/>
    <div className="field-row">
      <label>Label<input name="label" value={label} onChange={(e) => setLabel(e.target.value)} required /></label>
      <label>Stable key<input name="key" value={shownKey} onChange={(e) => { setKeyEdited(true); setKey(slugifyFieldKey(e.target.value)); }} pattern="[a-z0-9_]+" /><small className="form-hint">Generated from the label. This identifier is stored with every answer and can&apos;t change once the field is in use — edit it now if you need a specific key.</small></label>
    </div>
    <label>Help text<input name="helpText" defaultValue={createState.values?.helpText ?? ""} /><small className="form-hint">Optional guidance shown to whoever fills in this field.</small></label>
    <div className="field-row">
      <label>Type<select name="type" defaultValue={createState.values?.type ?? "TEXT"}>{["TEXT","TEXTAREA","NUMBER","EMAIL","PHONE","DATE","DROPDOWN","RADIO","CHECKBOX","YES_NO"].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Visibility<select name="visibility" defaultValue={createState.values?.visibility ?? "PUBLIC"}><option value="PUBLIC">All registration paths</option><option value="ADMIN_ONLY">Admins only</option><option value="HIDDEN">Hidden / history only</option></select></label>
    </div>
    <label className="choice"><input type="checkbox" name="isRequired" defaultChecked={createState.values?.isRequired === "on"}/> Required</label>
    <label>Options <small>(one per line as value|Label)</small><textarea name="options" rows={4} defaultValue={createState.values?.options ?? ""}/></label>
    <SubmitButton pendingText="Adding…">Add field</SubmitButton>
  </form>;
}

export function RegistrationFieldManager({ eventId, fields, archived = false }: { eventId: string; fields: Field[]; archived?: boolean }) {
  const [retireState, retireAction] = useActionState(retireRegistrationField, {});
  return <section className="form-card registration-fields-manager"><h2>Custom registration fields</h2><p>{archived ? "Archived Event fields are read-only." : "Answers stay with this event registration and never change the canonical person record."}</p>
    {fields.length === 0 ? <p className="empty-copy">No custom fields yet.</p> : <div className="configuration-list">{fields.map((field) => <article key={field.id} className="configuration-item"><div><strong>{field.label}</strong> <code className="field-key">{field.key}</code><p>{field.type.replaceAll("_", " ")} · {field.visibility.replaceAll("_", " ")}{field.isRequired ? " · required" : " · optional"}{!field.isActive ? " · retired" : ""}</p>{field.options.length > 0 && <small>{field.options.map(({ label }) => label).join(", ")}</small>}</div>{field.isActive && !archived && <form action={retireAction}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="fieldId" value={field.id}/><SubmitButton pendingText="Retiring…">Retire</SubmitButton></form>}</article>)}</div>}
    {retireState.error && <div className="alert" role="alert">{retireState.error}</div>}
    {!archived && <AddFieldForm eventId={eventId} />}
  </section>;
}
