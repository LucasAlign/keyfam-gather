"use client";

import type { Event, EventStatus } from "@prisma/client";
import { useActionState } from "react";
import { advanceEventStatus, duplicateEvent, updateEvent, type EventConfigurationActionState } from "@/app/event-configuration-actions";
import { SubmitButton } from "@/components/submit-button";
import { eventLocalDateTime } from "@/lib/event-datetime";

const initial: EventConfigurationActionState = {};

export function EventConfigurationForm({ event, nextStatus, canDuplicate }: { event: Event; nextStatus: EventStatus | null; canDuplicate: boolean }) {
  const [updateState, updateAction] = useActionState(updateEvent, initial);
  const [statusState, statusAction] = useActionState(advanceEventStatus, initial);
  const [duplicateState, duplicateAction] = useActionState(duplicateEvent, initial);
  const error = (name: string) => updateState.fields?.[name]?.[0];
  const archived = event.status === "ARCHIVED";
  return <div className="configuration-layout">
    <form action={updateAction} className="form-card configuration-form">
      <input type="hidden" name="eventId" value={event.id} />
      <h2>Event details</h2>
      {updateState.error && <div className="alert" role="alert">{updateState.error}</div>}
      {updateState.success && <div className="success" role="status">{updateState.success}</div>}
      {archived && <div className="capacity-warning">Archived events are read-only.</div>}
      <div className="field-row"><label>Event name<input name="name" defaultValue={event.name} disabled={archived} required />{error("name") && <small>{error("name")}</small>}</label><label>Event type<input name="eventType" defaultValue={event.eventType} disabled={archived} required /></label></div>
      <label>Description<textarea name="description" rows={4} defaultValue={event.description ?? ""} disabled={archived} /></label>
      <div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" defaultValue={eventLocalDateTime(event.startsAt, event.timezone)} disabled={archived} required /></label><label>Ends<input name="endsAt" type="datetime-local" defaultValue={eventLocalDateTime(event.endsAt, event.timezone)} disabled={archived} required />{error("endsAt") && <small>{error("endsAt")}</small>}</label></div>
      <div className="field-row"><label>Timezone<input name="timezone" defaultValue={event.timezone} disabled={archived} required /></label><label>Capacity<input name="capacity" type="number" min="1" defaultValue={event.capacity ?? ""} disabled={archived} /></label></div>
      <div className="field-row"><label>Venue<input name="venue" defaultValue={event.venue ?? ""} disabled={archived} /></label><label>Address<textarea name="address" rows={2} defaultValue={event.address ?? ""} disabled={archived} /></label></div>
      <fieldset><legend>Registration access</legend><label className="choice"><input name="isPublic" type="checkbox" defaultChecked={event.isPublic} disabled={archived} /> Public event</label><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" defaultValue={eventLocalDateTime(event.registrationOpensAt, event.timezone)} disabled={archived} /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" defaultValue={eventLocalDateTime(event.registrationClosesAt, event.timezone)} disabled={archived} />{error("registrationClosesAt") && <small>{error("registrationClosesAt")}</small>}</label></div></fieldset>
      <fieldset><legend>Event contact</legend><label>Contact name<input name="contactName" defaultValue={event.contactName ?? ""} disabled={archived} /></label><div className="field-row"><label>Email<input name="contactEmail" type="email" defaultValue={event.contactEmail ?? ""} disabled={archived} /></label><label>Phone<input name="contactPhone" type="tel" defaultValue={event.contactPhone ?? ""} disabled={archived} /></label></div></fieldset>
      <fieldset><legend>Branding</legend><div className="field-row"><label>Primary color<input name="brandingPrimaryColor" type="color" defaultValue={event.brandingPrimaryColor} disabled={archived} /></label><label>Logo URL<input name="brandingLogoUrl" type="url" placeholder="https://…" defaultValue={event.brandingLogoUrl ?? ""} disabled={archived} />{error("brandingLogoUrl") && <small>{error("brandingLogoUrl")}</small>}</label></div></fieldset>
      {!archived && <SubmitButton pendingText="Saving…">Save configuration</SubmitButton>}
    </form>
    <aside className="configuration-sidebar">
      <form action={statusAction} className="form-card"><h2>Lifecycle</h2><span className="status">{event.status.replaceAll("_", " ")}</span><p>Lifecycle changes move forward one operational stage at a time and are audited.</p>{statusState.error && <div className="alert" role="alert">{statusState.error}</div>}{statusState.success && <div className="success" role="status">{statusState.success}</div>}<input type="hidden" name="eventId" value={event.id} />{nextStatus ? <><input type="hidden" name="status" value={nextStatus} /><SubmitButton pendingText="Updating…">Move to {nextStatus.replaceAll("_", " ")}</SubmitButton></> : <p>This event has reached its final lifecycle stage.</p>}</form>
      {canDuplicate && <form action={duplicateAction} className="form-card"><h2>Duplicate configuration</h2><p>Copies event details, groups, and tables into a new draft. People, registrations, hosts, invitations, parties, and attendance stay behind.</p>{duplicateState.error && <div className="alert" role="alert">{duplicateState.error}</div>}<input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="timezone" value={event.timezone} /><label>New event name<input name="name" defaultValue={`${event.name} copy`} required /></label><div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" required /></label><label>Ends<input name="endsAt" type="datetime-local" required /></label></div><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" /></label></div><SubmitButton pendingText="Duplicating…">Create draft copy</SubmitButton></form>}
    </aside>
  </div>;
}
