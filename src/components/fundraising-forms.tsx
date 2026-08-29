"use client";

import { useActionState } from "react";
import { createCommitment, recordTransaction, updateFundraisingGoal, type FundraisingActionState } from "@/app/fundraising-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: FundraisingActionState = {};

function Feedback({ state }: { state: FundraisingActionState }) {
  return <>{state.error && <div className="alert" role="alert">{state.error}</div>}{state.success && <div className="success" role="status">{state.success}</div>}</>;
}

export function FundraisingGoalForm({ eventId, goalCents }: { eventId: string; goalCents: number | null }) {
  const [state, action] = useActionState(updateFundraisingGoal, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Fundraising goal</h2><label>Goal amount<input name="goal" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={goalCents === null ? "" : (goalCents / 100).toFixed(2)} required /></label><SubmitButton pendingText="Updating…">Update goal</SubmitButton></form>;
}

export function CommitmentForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createCommitment, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Record a commitment</h2><div className="field-row"><label>Type<select name="kind" defaultValue="DONATION"><option value="DONATION">Donation</option><option value="PLEDGE">Pledge</option><option value="SPONSORSHIP">Sponsorship</option><option value="TICKET">Ticket revenue</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label></div><label>Description<input name="description" maxLength={240} placeholder="Optional source or purpose" /></label><label className="choice"><input name="receivedNow" type="checkbox" value="true" /> Record the full amount as received now</label><p className="form-hint">Leave this unchecked for an unpaid Pledge or Sponsorship. Gather never counts a commitment as received cash until a Payment is recorded.</p><SubmitButton pendingText="Recording…">Record commitment</SubmitButton></form>;
}

export function TransactionForm({ eventId, commitments }: { eventId: string; commitments: Array<{ id: string; label: string }> }) {
  const [state, action] = useActionState(recordTransaction, initial);
  return <form action={action} className="form-card compact-form"><input type="hidden" name="eventId" value={eventId} /><Feedback state={state} /><h2>Record cash movement</h2><label>Commitment<select name="commitmentId" required defaultValue=""><option value="" disabled>Choose a commitment</option>{commitments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="field-row"><label>Transaction<select name="kind" defaultValue="PAYMENT"><option value="PAYMENT">Payment received</option><option value="REFUND">Refund issued</option></select></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required /></label></div><label>Note<input name="note" maxLength={240} /></label><SubmitButton pendingText="Recording…">Record transaction</SubmitButton></form>;
}
