"use client";

import { useActionState } from "react";
import { createCommitment, createSponsorship, recordTransaction, updateFundraisingGoal, updateSponsorshipFulfillment, type FundraisingActionState } from "@/app/fundraising-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: FundraisingActionState = {};

function Feedback({ state }: { state: FundraisingActionState }) {
  return <>{state.error && <div className="alert" role="alert">{state.error}</div>}{state.success && <div className="success" role="status">{state.success}</div>}</>;
}

export function FundraisingGoalForm({ eventId, goalCents }: { eventId: string; goalCents: number | null }) {
  const [state, action] = useActionState(updateFundraisingGoal, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Fundraising goal</h2><label>Goal amount<input name="goal" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={goalCents === null ? "" : (goalCents / 100).toFixed(2)} required /></label><SubmitButton pendingText="Updating…">Update goal</SubmitButton></form>;
}

type Choice = { id: string; label: string };

export function CommitmentForm({ eventId, people, groups }: { eventId: string; people: Choice[]; groups: Choice[] }) {
  const [state, action] = useActionState(createCommitment, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Record a commitment</h2><div className="field-row"><label>Type<select name="kind" defaultValue="DONATION"><option value="DONATION">Donation</option><option value="PLEDGE">Pledge</option><option value="TICKET">Ticket revenue</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label></div><div className="field-row"><label>Person<select name="personId" defaultValue=""><option value="">Unattributed</option>{people.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Group<select name="groupId" defaultValue=""><option value="">No Group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div><label>Description<input name="description" maxLength={240} placeholder="Optional source or purpose" /></label><label className="choice"><input name="receivedNow" type="checkbox" value="true" /> Record the full amount as received now</label><p className="form-hint">Use the Sponsorship form for sponsor revenue. Gather never counts a commitment as received cash until a Payment is recorded.</p><SubmitButton pendingText="Recording…">Record commitment</SubmitButton></form>;
}

export function SponsorshipForm({ eventId, people, groups }: { eventId: string; people: Choice[]; groups: Choice[] }) {
  const [state, action] = useActionState(createSponsorship, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Add a sponsor</h2><div className="field-row"><label>Sponsor name<input name="sponsorName" required maxLength={120} /></label><label>Level<input name="level" required maxLength={80} placeholder="Gold" /></label></div><div className="field-row"><label>Commitment amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Guest allotment<input name="guestAllotment" type="number" min="0" step="1" defaultValue="0" required /></label></div><div className="field-row"><label>Primary contact<select name="primaryContactPersonId" defaultValue=""><option value="">No contact selected</option>{people.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Sponsor guest Group<select name="groupId" defaultValue=""><option value="">No Group yet</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div><label>Logo URL<input name="logoUrl" type="url" /></label><label>Benefits<textarea name="benefits" rows={3} /></label><label>Recognition requirements<textarea name="recognitionNeeds" rows={3} /></label><label className="choice"><input name="receivedNow" type="checkbox" value="true" /> Record full payment as received</label><SubmitButton pendingText="Adding…">Add sponsor</SubmitButton></form>;
}

export function SponsorshipFulfillmentForm({ eventId, sponsorshipId, status, notes }: { eventId: string; sponsorshipId: string; status: string; notes: string }) {
  const [state, action] = useActionState(updateSponsorshipFulfillment, initial);
  return <form action={action} className="compact-form"><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="sponsorshipId" value={sponsorshipId} /><Feedback state={state} /><label>Fulfillment<select name="fulfillmentStatus" defaultValue={status}><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETE">Complete</option><option value="BLOCKED">Blocked</option></select></label><label>Notes<textarea name="fulfillmentNotes" defaultValue={notes} rows={2} /></label><SubmitButton pendingText="Saving…">Save fulfillment</SubmitButton></form>;
}

export function TransactionForm({ eventId, commitments }: { eventId: string; commitments: Array<{ id: string; label: string }> }) {
  const [state, action] = useActionState(recordTransaction, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Record cash movement</h2><label>Commitment<select name="commitmentId" required defaultValue=""><option value="" disabled>Choose a commitment</option>{commitments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="field-row"><label>Transaction<select name="kind" defaultValue="PAYMENT"><option value="PAYMENT">Payment received</option><option value="REFUND">Refund issued</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label></div><label>Note<input name="note" maxLength={240} /></label><SubmitButton pendingText="Recording…">Record transaction</SubmitButton></form>;
}
