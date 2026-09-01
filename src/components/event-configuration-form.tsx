"use client";

import type { Event, EventStatus } from "@prisma/client";
import { useActionState } from "react";
import { advanceEventStatus, duplicateEvent, updateEvent, type EventConfigurationActionState } from "@/app/event-configuration-actions";
import { SubmitButton } from "@/components/submit-button";
import { eventLocalDateTime } from "@/lib/event-datetime";
import { friendlyEventStatus, lifecycleConsequences } from "@/lib/event-readiness";

const initial: EventConfigurationActionState = {};

export function EventConfigurationForm({ event, nextStatus, canDuplicate }: { event: Event; nextStatus: EventStatus | null; canDuplicate: boolean }) {
  const [updateState, updateAction] = useActionState(updateEvent, initial);
  const [statusState, statusAction] = useActionState(advanceEventStatus, initial);
  const [duplicateState, duplicateAction] = useActionState(duplicateEvent, initial);
  const error = (name: string) => updateState.fields?.[name]?.[0];
  const archived = event.status === "ARCHIVED";
  const consequences = nextStatus ? lifecycleConsequences(nextStatus) : [];
  // Prefer values the coordinator just submitted (kept across a failed save)
  // over the last-saved event; on success the action omits values so these fall
  // back to the freshly revalidated event props.
  const keep = (name: string, fallback: string) => updateState.values?.[name] ?? fallback;
  const publicChecked = updateState.values ? updateState.values.isPublic === "on" : event.isPublic;
  return <div className="configuration-layout">
    <form key={updateState.token ?? "initial"} action={updateAction} className="form-card configuration-form">
      <input type="hidden" name="eventId" value={event.id} />
      <h2>Event details</h2>
      {updateState.error && <div className="alert" role="alert">{updateState.error}</div>}
      {updateState.success && <div className="success" role="status">{updateState.success}</div>}
      {archived && <div className="capacity-warning">Archived events are read-only.</div>}
      <div className="field-row"><label>Event name<input name="name" defaultValue={keep("name", event.name)} disabled={archived} required />{error("name") && <small>{error("name")}</small>}</label><label>Event type<input name="eventType" defaultValue={keep("eventType", event.eventType)} placeholder="Fundraising banquet, gala, volunteer dinner" disabled={archived} required /><small>Use the familiar name your team uses for this kind of Event.</small></label></div>
      <label>Description<textarea name="description" rows={4} defaultValue={keep("description", event.description ?? "")} disabled={archived} /></label>
      <p className="form-hint">Times below use {event.timezone}. Currently {new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(event.startsAt)} through {new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(event.endsAt)}.</p><div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" defaultValue={keep("startsAt", eventLocalDateTime(event.startsAt, event.timezone))} disabled={archived} required /></label><label>Ends<input name="endsAt" type="datetime-local" defaultValue={keep("endsAt", eventLocalDateTime(event.endsAt, event.timezone))} disabled={archived} required />{error("endsAt") && <small>{error("endsAt")}</small>}</label></div>
      <div className="field-row"><label>Timezone<input name="timezone" defaultValue={keep("timezone", event.timezone)} disabled={archived} required /></label><label>Capacity<input name="capacity" type="number" min="1" defaultValue={keep("capacity", event.capacity === null ? "" : String(event.capacity))} disabled={archived} /></label></div>
      <div className="field-row"><label>Venue<input name="venue" defaultValue={keep("venue", event.venue ?? "")} disabled={archived} /></label><label>Address<textarea name="address" rows={2} defaultValue={keep("address", event.address ?? "")} disabled={archived} /></label></div>
      <fieldset><legend>Registration access</legend><label className="choice"><input name="isPublic" type="checkbox" defaultChecked={publicChecked} disabled={archived} /> Public event</label><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" defaultValue={keep("registrationOpensAt", eventLocalDateTime(event.registrationOpensAt, event.timezone))} disabled={archived} /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" defaultValue={keep("registrationClosesAt", eventLocalDateTime(event.registrationClosesAt, event.timezone))} disabled={archived} />{error("registrationClosesAt") && <small>{error("registrationClosesAt")}</small>}</label></div></fieldset>
      <fieldset><legend>Event contact</legend><label>Contact name<input name="contactName" defaultValue={keep("contactName", event.contactName ?? "")} disabled={archived} /></label><div className="field-row"><label>Email<input name="contactEmail" type="email" defaultValue={keep("contactEmail", event.contactEmail ?? "")} disabled={archived} />{error("contactEmail") && <small>{error("contactEmail")}</small>}</label><label>Phone<input name="contactPhone" type="tel" defaultValue={keep("contactPhone", event.contactPhone ?? "")} disabled={archived} /></label></div></fieldset>
      <fieldset><legend>Branding</legend><div className="field-row"><label>Primary color<input name="brandingPrimaryColor" type="color" defaultValue={keep("brandingPrimaryColor", event.brandingPrimaryColor)} disabled={archived} /></label><label>Logo URL<input name="brandingLogoUrl" type="url" placeholder="https://…" defaultValue={keep("brandingLogoUrl", event.brandingLogoUrl ?? "")} disabled={archived} />{error("brandingLogoUrl") && <small>{error("brandingLogoUrl")}</small>}</label></div></fieldset>
      {!archived && <SubmitButton pendingText="Saving…">Save configuration</SubmitButton>}
    </form>
    <aside className="configuration-sidebar">
      <form action={statusAction} className="form-card"><h2>Lifecycle</h2><span className="status">{friendlyEventStatus(event.status)}</span><p>Lifecycle changes move forward one operational stage at a time and are audited.</p>{nextStatus && <div className="capacity-warning"><strong>Before moving to {friendlyEventStatus(nextStatus)}:</strong><ul>{consequences.map((item) => <li key={item}>{item}</li>)}</ul><p>Review the readiness checklist on the Event dashboard for concerns. Warnings do not silently block an authorized transition.</p></div>}{statusState.error && <div className="alert" role="alert">{statusState.error}</div>}{statusState.success && <div className="success" role="status">{statusState.success}</div>}<input type="hidden" name="eventId" value={event.id} />{nextStatus ? <><input type="hidden" name="status" value={nextStatus} /><SubmitButton pendingText="Updating…">Confirm move to {friendlyEventStatus(nextStatus)}</SubmitButton></> : <p>This Event has reached its final lifecycle stage.</p>}</form>
      {canDuplicate && <form action={duplicateAction} className="form-card"><h2>Duplicate configuration</h2><p>Copies event details, groups, and tables into a new draft. People, registrations, hosts, invitations, parties, and attendance stay behind.</p>{duplicateState.error && <div className="alert" role="alert">{duplicateState.error}</div>}<input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="timezone" value={event.timezone} /><label>New event name<input name="name" defaultValue={`${event.name} copy`} required /></label><div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" required /></label><label>Ends<input name="endsAt" type="datetime-local" required /></label></div><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" /></label></div><SubmitButton pendingText="Duplicating…">Create draft copy</SubmitButton></form>}
    </aside>
  </div>;
}
