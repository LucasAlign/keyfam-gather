"use client";
import type { EventRegistrationField, EventRegistrationFieldOption } from "@prisma/client";
import { useActionState } from "react";
import { createRegistrationField, retireRegistrationField } from "@/app/registration-field-actions";
import { SubmitButton } from "@/components/submit-button";
type Field = EventRegistrationField & { options: EventRegistrationFieldOption[] };
export function RegistrationFieldManager({ eventId, fields }: { eventId: string; fields: Field[] }) {
  const [createState, createAction] = useActionState(createRegistrationField, {});
  const [retireState, retireAction] = useActionState(retireRegistrationField, {});
  return <section className="form-card registration-fields-manager"><h2>Custom registration fields</h2><p>Answers stay with this event registration and never change the canonical person record.</p>
    {fields.length === 0 ? <p className="empty-copy">No custom fields yet.</p> : <div className="configuration-list">{fields.map((field) => <article key={field.id} className="configuration-item"><div><strong>{field.label}</strong><p>{field.type.replaceAll("_", " ")} · {field.visibility.replaceAll("_", " ")}{field.isRequired ? " · required" : " · optional"}{!field.isActive ? " · retired" : ""}</p>{field.options.length > 0 && <small>{field.options.map(({ label }) => label).join(", ")}</small>}</div>{field.isActive && <form action={retireAction}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="fieldId" value={field.id}/><SubmitButton pendingText="Retiring…">Retire</SubmitButton></form>}</article>)}</div>}
    {retireState.error && <div className="alert" role="alert">{retireState.error}</div>}
    <form action={createAction} className="nested-form"><h3>Add a field</h3>{createState.error && <div className="alert" role="alert">{createState.error}</div>}{createState.success && <div className="success" role="status">{createState.success}</div>}<input type="hidden" name="eventId" value={eventId}/><div className="field-row"><label>Label<input name="label" required /></label><label>Stable key<input name="key" pattern="[A-Za-z0-9_-]+" required /></label></div><label>Help text<input name="helpText" /></label><div className="field-row"><label>Type<select name="type" defaultValue="TEXT">{["TEXT","TEXTAREA","NUMBER","EMAIL","PHONE","DATE","DROPDOWN","RADIO","CHECKBOX","YES_NO"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Visibility<select name="visibility" defaultValue="PUBLIC"><option value="PUBLIC">All registration paths</option><option value="ADMIN_ONLY">Admins only</option><option value="HIDDEN">Hidden / history only</option></select></label></div><label className="choice"><input type="checkbox" name="isRequired"/> Required</label><label>Options <small>(one per line as value|Label)</small><textarea name="options" rows={4}/></label><SubmitButton pendingText="Adding…">Add field</SubmitButton></form>
  </section>;
}
