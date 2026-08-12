"use client";

import { useActionState } from "react";
import { createEvent, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};
export function EventForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState(createEvent, initialState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="organizationId" value={organizationId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <label>Event name<input name="name" required aria-invalid={Boolean(error("name"))} />{error("name") && <small>{error("name")}</small>}</label>
    <label>Description<textarea name="description" rows={3} /></label>
    <div className="field-row">
      <label>Starts<input name="startsAt" type="datetime-local" required />{error("startsAt") && <small>{error("startsAt")}</small>}</label>
      <label>Ends<input name="endsAt" type="datetime-local" required />{error("endsAt") && <small>{error("endsAt")}</small>}</label>
    </div>
    <div className="field-row">
      <label>Timezone<input name="timezone" defaultValue="America/New_York" required /></label>
      <label>Capacity<input name="capacity" type="number" min="1" inputMode="numeric" /></label>
    </div>
    <label>Venue<input name="venue" /></label>
    <SubmitButton pendingText="Creating event…">Create event</SubmitButton>
  </form>;
}
