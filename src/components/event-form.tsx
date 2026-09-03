"use client";

import { useActionState } from "react";
import { createEvent, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};
export function EventForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState(createEvent, initialState);
  const error = (name: string) => state.fields?.[name]?.[0];
  // Keep whatever the coordinator typed across a failed submit (React 19 resets
  // uncontrolled inputs after a form action).
  const keep = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const publicChecked = state.values ? state.values.isPublic === "on" : false;
  return <form key={state.token ?? "initial"} action={action} className="form-card">
    <input type="hidden" name="organizationId" value={organizationId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <label>Event name<input name="name" defaultValue={keep("name", "")} required aria-invalid={Boolean(error("name"))} />{error("name") && <small>{error("name")}</small>}</label>
    <label>Description<textarea name="description" rows={3} defaultValue={keep("description", "")} /></label>
    <label>Event type<input name="eventType" defaultValue={keep("eventType", "Fundraising event")} required /></label>
    <div className="field-row">
      <label>Starts<input name="startsAt" type="datetime-local" defaultValue={keep("startsAt", "")} required />{error("startsAt") && <small>{error("startsAt")}</small>}</label>
      <label>Ends<input name="endsAt" type="datetime-local" defaultValue={keep("endsAt", "")} required />{error("endsAt") && <small>{error("endsAt")}</small>}</label>
    </div>
    <div className="field-row">
      <label>Timezone<input name="timezone" defaultValue={keep("timezone", "America/New_York")} required /></label>
      <label>Capacity<input name="capacity" type="number" min="1" inputMode="numeric" defaultValue={keep("capacity", "")} /></label>
    </div>
    <label>Venue<input name="venue" defaultValue={keep("venue", "")} /></label>
    <label>Address<textarea name="address" rows={2} defaultValue={keep("address", "")} /></label>
    <fieldset><legend>Registration access</legend><label className="choice"><input name="isPublic" type="checkbox" defaultChecked={publicChecked} /> Public event</label><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" defaultValue={keep("registrationOpensAt", "")} /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" defaultValue={keep("registrationClosesAt", "")} />{error("registrationClosesAt") && <small>{error("registrationClosesAt")}</small>}</label></div></fieldset>
    <fieldset><legend>Event contact</legend><label>Contact name<input name="contactName" defaultValue={keep("contactName", "")} /></label><div className="field-row"><label>Email<input name="contactEmail" type="email" defaultValue={keep("contactEmail", "")} />{error("contactEmail") && <small>{error("contactEmail")}</small>}</label><label>Phone<input name="contactPhone" type="tel" defaultValue={keep("contactPhone", "")} /></label></div></fieldset>
    <fieldset><legend>Branding</legend><div className="field-row"><label>Primary color<input name="brandingPrimaryColor" type="color" defaultValue={keep("brandingPrimaryColor", "#173a32")} /></label><label>Logo URL<input name="brandingLogoUrl" type="url" placeholder="https://…" defaultValue={keep("brandingLogoUrl", "")} />{error("brandingLogoUrl") && <small>{error("brandingLogoUrl")}</small>}</label></div></fieldset>
    <SubmitButton pendingText="Creating event…">Create event</SubmitButton>
  </form>;
}
