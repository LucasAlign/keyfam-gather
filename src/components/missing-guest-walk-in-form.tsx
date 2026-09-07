"use client";

import { useActionState } from "react";
import { addAndCheckInWalkIn, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

type Option = { id: string; name: string; detail: string };
export function MissingGuestWalkInForm({ eventId, canApprove, groups, tables }: { eventId: string; canApprove: boolean; groups: Option[]; tables: Option[] }) {
  const [state, action] = useActionState(addAndCheckInWalkIn, {} as ActionState);
  if (!canApprove) return <div className="alert"><strong>Escalate to a Check-In Lead.</strong> Volunteers can review likely context, but cannot create or seat a walk-in.</div>;
  return <form action={action} className="form-card"><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="deviceId" value="missing-guest-assistant" /><h2>Approve a genuine walk-in</h2><p className="form-hint">First rule out the matches above. Approval creates the Registration, applies Group and Table capacity checks, and checks the guest in as one audited transaction.</p>{state.error && <div className="alert">{state.error}</div>}{state.success && <div className="success">{state.success}</div>}<div className="field-row"><label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label></div><div className="field-row"><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" type="tel" /></label></div><div className="field-row"><label>Group<select name="groupId" defaultValue=""><option value="">No Group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.detail}</option>)}</select></label><label>Table<select name="tableId" defaultValue=""><option value="">Unassigned</option>{tables.map((item) => <option key={item.id} value={item.id} disabled={item.detail.startsWith("0 ")}>{item.name} — {item.detail}</option>)}</select></label></div><label className="choice"><input type="checkbox" name="overrideCapacity" /> Lead-approved capacity override</label><SubmitButton pendingText="Creating and checking in…">Approve, register, seat, and check in</SubmitButton></form>;
}
