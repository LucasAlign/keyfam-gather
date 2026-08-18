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
    <label>Event type<input name="eventType" defaultValue="Fundraising event" required /></label>
    <div className="field-row">
      <label>Starts<input name="startsAt" type="datetime-local" required />{error("startsAt") && <small>{error("startsAt")}</small>}</label>
      <label>Ends<input name="endsAt" type="datetime-local" required />{error("endsAt") && <small>{error("endsAt")}</small>}</label>
    </div>
    <div className="field-row">
      <label>Timezone<input name="timezone" defaultValue="America/New_York" required /></label>
      <label>Capacity<input name="capacity" type="number" min="1" inputMode="numeric" /></label>
    </div>
    <label>Venue<input name="venue" /></label>
    <label>Address<textarea name="address" rows={2} /></label>
    <fieldset><legend>Registration access</legend><label className="choice"><input name="isPublic" type="checkbox" /> Public event</label><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" />{error("registrationClosesAt") && <small>{error("registrationClosesAt")}</small>}</label></div></fieldset>
    <fieldset><legend>Event contact</legend><label>Contact name<input name="contactName" /></label><div className="field-row"><label>Email<input name="contactEmail" type="email" /></label><label>Phone<input name="contactPhone" type="tel" /></label></div></fieldset>
    <fieldset><legend>Branding</legend><div className="field-row"><label>Primary color<input name="brandingPrimaryColor" type="color" defaultValue="#173a32" /></label><label>Logo URL<input name="brandingLogoUrl" type="url" placeholder="https://…" /></label></div></fieldset>
    <SubmitButton pendingText="Creating event…">Create event</SubmitButton>
  </form>;
}
