"use client";

import { useActionState } from "react";
import { registerPerson, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { FieldDefinition } from "@/lib/registration-fields";

type Named = { id: string; name: string };
export function RegistrationForm({ eventId, fields, canResolve, canAssign, groups, parties, tables }: { eventId: string; fields: FieldDefinition[]; canResolve: boolean; canAssign: boolean; groups: Named[]; parties: Named[]; tables: Array<Named & { capacity: number; occupied: number }> }) {
  const [state, action] = useActionState(registerPerson, {} as ActionState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="eventId" value={eventId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row">
      <label>First name<input name="firstName" autoComplete="given-name" defaultValue={state.values?.firstName} required />{error("firstName") && <small>{error("firstName")}</small>}</label>
      <label>Last name<input name="lastName" autoComplete="family-name" defaultValue={state.values?.lastName} required />{error("lastName") && <small>{error("lastName")}</small>}</label>
    </div>
    <label>Email<input name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone} />{error("phone") && <small>{error("phone")}</small>}</label>
    {canAssign && <fieldset><legend>Optional Event assignments</legend><div className="field-row"><label>Group<select name="groupId" defaultValue={state.values?.groupId ?? ""}><option value="">No Group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Party<select name="partyId" defaultValue={state.values?.partyId ?? ""}><option value="">No Party</option>{parties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label>Table<select name="tableId" defaultValue={state.values?.tableId ?? ""}><option value="">Unassigned</option>{tables.map((item) => <option key={item.id} value={item.id}>{item.name} · {Math.max(item.capacity - item.occupied, 0)} seats left</option>)}</select></label><label className="choice"><input name="overrideCapacity" type="checkbox" /> Allow an over-capacity assignment and record the override</label></fieldset>}
    {fields.filter((field) => field.isActive && (field.visibility === "PUBLIC" || field.visibility === "ADMIN_ONLY" && canResolve)).map((field) => {
      const name = `custom_${field.id}`; const message = error(name);
      if (field.type === "TEXTAREA") return <label key={field.id}>{field.label}<textarea name={name} required={field.isRequired}/>{message && <small>{message}</small>}</label>;
      if (["DROPDOWN", "RADIO", "CHECKBOX"].includes(field.type)) return <fieldset key={field.id}><legend>{field.label}</legend>{field.type === "DROPDOWN" ? <select name={name} required={field.isRequired}><option value="">Choose…</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.options.map((option) => <label className="choice" key={option.value}><input type={field.type === "RADIO" ? "radio" : "checkbox"} name={name} value={option.value} required={field.type === "RADIO" && field.isRequired}/>{option.label}</label>)}{message && <small>{message}</small>}</fieldset>;
      if (field.type === "YES_NO") return <label key={field.id}>{field.label}<select name={name} required={field.isRequired}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>{message && <small>{message}</small>}</label>;
      const type = field.type === "NUMBER" ? "number" : field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "DATE" ? "date" : "text";
      return <label key={field.id}>{field.label}<input name={name} type={type} defaultValue={state.values?.[name]} required={field.isRequired}/>{message && <small>{message}</small>}</label>;
    })}
    {state.candidates && canResolve && <fieldset><legend>Resolve possible duplicate</legend><p className="form-hint">These records have similar identity details. Select the existing Person only when they are the same guest.</p>{state.candidates.map((candidate) => <label className="choice" key={candidate.id}><input type="radio" name="personId" value={candidate.id}/>{candidate.name}</label>)}<div className="button-row"><button className="button secondary" type="submit" name="resolutionChoice" value="use-existing">Use selected Person</button><button className="button" type="submit" name="resolutionChoice" value="create-new">Keep separate and create new Person</button></div></fieldset>}
    <p className="form-hint">Gather matches exact email or phone records and will reuse an existing person when it is safe.</p>
    {!state.candidates && <SubmitButton pendingText="Registering…">Register person</SubmitButton>}
  </form>;
}
