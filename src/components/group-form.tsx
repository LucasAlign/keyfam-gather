"use client";
import { useActionState } from "react";
import { createGroup, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
export function GroupForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createGroup, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} />{state.error && <div className="alert" role="alert">{state.error}</div>}<h2>Create a group without a host</h2><div className="field-row"><label>Group name<input name="name" required />{error("name") && <small>{error("name")}</small>}</label><label>Capacity<input name="capacity" type="number" min="1" inputMode="numeric" />{error("capacity") && <small>{error("capacity")}</small>}</label></div><SubmitButton pendingText="Creating group…">Create group</SubmitButton></form>;
}
