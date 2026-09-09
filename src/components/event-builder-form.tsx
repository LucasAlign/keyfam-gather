"use client";

import { useActionState } from "react";
import { approveEventProposal, draftEventProposal, type EventBuilderState } from "@/app/event-builder-actions";
import { SubmitButton } from "@/components/submit-button";

export function EventBuilderForm({ organizationId }: { organizationId: string }) {
  const [draft, draftAction] = useActionState(draftEventProposal, {} as EventBuilderState);
  const [approval, approvalAction] = useActionState(approveEventProposal, {} as EventBuilderState);
  const proposal = approval.proposal ?? draft.proposal;
  const description = approval.description ?? draft.description ?? "";
  const error = (name: string) => approval.fields?.[name]?.[0];
  if (!proposal) return <form action={draftAction} className="form-card"><h2>Describe your Event</h2>{draft.error && <div className="alert">{draft.error}</div>}<label>Plain-language description<textarea name="description" rows={5} defaultValue={description} placeholder="We are holding a fundraising banquet for 250 people with 25 Tables of 10." required /></label><SubmitButton pendingText="Preparing proposal…">Prepare proposal</SubmitButton></form>;
  return <form action={approvalAction} className="form-card builder-review">
    <input type="hidden" name="organizationId" value={organizationId} />
    <h2>Review before anything changes</h2>{approval.error && <div className="alert">{approval.error}</div>}
    <fieldset><legend>Event details</legend>
      <label>Event name<input name="name" defaultValue={proposal.name} required />{error("name") && <small>{error("name")}</small>}</label>
      <label>Event type<input name="eventType" defaultValue={proposal.eventType} required /></label>
      <div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" defaultValue={proposal.startsAt} required />{error("startsAt") && <small>{error("startsAt")}</small>}</label><label>Ends<input name="endsAt" type="datetime-local" defaultValue={proposal.endsAt} required />{error("endsAt") && <small>{error("endsAt")}</small>}</label></div>
      <div className="field-row"><label>Timezone<input name="timezone" defaultValue={proposal.timezone} required /></label><label>Capacity<input name="capacity" type="number" min="1" defaultValue={proposal.capacity ?? ""} /></label></div>
      <div className="field-row"><label>Venue<input name="venue" defaultValue={proposal.venue} /></label><label>Address<input name="address" defaultValue={proposal.address} /></label></div>
      <fieldset><legend>Registration access</legend><label className="choice"><input name="isPublic" type="checkbox" defaultChecked={proposal.isPublic} /> Public event</label><div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" defaultValue={proposal.registrationOpensAt} /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" defaultValue={proposal.registrationClosesAt} /></label></div></fieldset>
      <fieldset><legend>Event contact</legend><label>Contact name<input name="contactName" defaultValue={proposal.contactName} /></label><div className="field-row"><label>Email<input name="contactEmail" type="email" defaultValue={proposal.contactEmail} /></label><label>Phone<input name="contactPhone" type="tel" defaultValue={proposal.contactPhone} /></label></div></fieldset>
      <input type="hidden" name="description" value={description} /><input type="hidden" name="brandingPrimaryColor" value="#173a32" />
    </fieldset>
    <fieldset><legend>Selected setup</legend><div className="field-row"><label>Table count<input name="tableCount" type="number" min="1" defaultValue={proposal.tableCount ?? ""} /></label><label>Seats per Table<input name="seatsPerTable" type="number" min="1" defaultValue={proposal.seatsPerTable ?? ""} /></label></div><label className="choice"><input type="checkbox" name="createTables" value="true" defaultChecked={Boolean(proposal.tableCount)} /> Create numbered Tables</label><label className="choice"><input type="checkbox" name="createHostGroups" value="true" /> Create matching Host Groups</label><label className="choice"><input type="checkbox" name="createQuestions" value="true" defaultChecked /> Add dietary and accessibility questions</label></fieldset>
    <fieldset><legend>Assumptions and missing inputs</legend>{proposal.assumptions.map((item) => <p key={item}>• {item}</p>)}{proposal.missingRequired.map((item) => <p key={item}><strong>Required:</strong> {item}</p>)}</fieldset>
    <fieldset><legend>Suggested communication plan</legend><p className="form-hint">Saved in the audit record for review; messages are not sent automatically.</p>{proposal.communicationPlan.map((item) => <p key={item}>• {item}</p>)}</fieldset>
    <fieldset><legend>Budget & costs</legend><label>Total event budget (USD)<input name="budgetCents" type="number" min="0" max="21474836.47" step="0.01" />{error("budgetCents") && <small>{error("budgetCents")}</small>}</label><p className="form-hint">Track individual costs and add Google Drive document links on your dashboard after creation.</p></fieldset>
    <SubmitButton pendingText="Building Event…">Approve selected changes</SubmitButton>
  </form>;
}
