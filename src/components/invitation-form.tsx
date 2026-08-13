"use client";

import { useActionState } from "react";
import { createInvitationDraft, type InvitationActionState } from "@/app/invitation-actions";
import { SubmitButton } from "@/components/submit-button";

export function InvitationForm({ eventId, groups }: { eventId: string; groups: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createInvitationDraft, {} as InvitationActionState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form">
    <input type="hidden" name="eventId" value={eventId} />
    <h2>Create invitation draft</h2>
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row"><label>First name<input name="firstName" required />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" required />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <label>Email<input name="email" type="email" />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" />{error("phone") && <small>{error("phone")}</small>}</label>
    <label>Group <span className="optional">optional</span><select name="groupId"><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <p className="form-hint">Create the draft first, then Send generates a secure registration link.</p>
    <SubmitButton pendingText="Creating draft…">Create draft</SubmitButton>
  </form>;
}
