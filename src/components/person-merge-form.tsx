"use client";
import { useActionState } from "react";
import { mergePersonRecords } from "@/app/registration-actions";
import { SubmitButton } from "@/components/submit-button";
export function PersonMergeForm({ eventId, people }: { eventId: string; people: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(mergePersonRecords, {});
  return <form action={action} className="form-card"><h2>Merge person records</h2><p>This organization-wide operation keeps the target person, tombstones the source, and supersedes duplicate event registrations. It never overwrites custom answers.</p>{state.error && <div className="alert" role="alert">{state.error}</div>}{state.success && <div className="success" role="status">{state.success}</div>}<input type="hidden" name="eventId" value={eventId}/><div className="field-row"><label>Source record<select name="sourcePersonId" required><option value="">Choose…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Target record to keep<select name="targetPersonId" required><option value="">Choose…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div><label>Reason<input name="reason" required /></label><SubmitButton pendingText="Merging…">Merge Records</SubmitButton></form>;
}
