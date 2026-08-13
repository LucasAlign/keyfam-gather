"use client";

import { useActionState } from "react";
import { createParty, createSeatingTable, moveSeating, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

type NamedOption = { id: string; name: string };
type RegistrantOption = NamedOption & { detail: string };

export function TableForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createSeatingTable, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h2>Create a table</h2><div className="field-row"><label>Name or number<input name="name" required />{error("name") && <small>{error("name")}</small>}</label><label>Capacity<input name="capacity" type="number" min="1" required />{error("capacity") && <small>{error("capacity")}</small>}</label></div><label>Notes<textarea name="notes" rows={2} /></label><SubmitButton pendingText="Creating table…">Create table</SubmitButton></form>;
}

export function PartyForm({ eventId, registrations }: { eventId: string; registrations: RegistrantOption[] }) {
  const [state, action] = useActionState(createParty, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h2>Create a party</h2><label>Party name<input name="name" required placeholder="Smith Party" />{error("name") && <small>{error("name")}</small>}</label><fieldset><legend>People moving together</legend><div className="check-list">{registrations.map((item) => <label className="choice" key={item.id}><input type="checkbox" name="registrationIds" value={item.id} /> <span>{item.name}<small>{item.detail}</small></span></label>)}</div>{error("registrationIds") && <small>{error("registrationIds")}</small>}</fieldset><SubmitButton pendingText="Creating party…">Create party</SubmitButton></form>;
}

export function MoveForm({ eventId, sourceType, sources, tables, title }: { eventId: string; sourceType: "registration" | "group" | "party"; sources: NamedOption[]; tables: NamedOption[]; title: string }) {
  const [state, action] = useActionState(moveSeating, {} as ActionState);
  return <form action={action} className="move-form"><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="sourceType" value={sourceType} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h3>{title}</h3><label>{sourceType === "registration" ? "Registrant" : sourceType === "group" ? "Group" : "Party"}<select name="sourceId" required defaultValue=""><option value="">Choose one</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label><label>Destination<select name="tableId" defaultValue=""><option value="">Unassigned</option>{tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label><label className="choice override"><input type="checkbox" name="overrideCapacity" /> Allow this move over capacity</label><SubmitButton pendingText="Moving…">Update seating</SubmitButton></form>;
}
