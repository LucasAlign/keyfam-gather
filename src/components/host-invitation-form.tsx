"use client";

import { useActionState } from "react";
import { createHostInvitation, type InvitationActionState } from "@/app/invitation-actions";
import { SubmitButton } from "@/components/submit-button";

export function HostInvitationForm({ token, disabled }: { token: string; disabled: boolean }) {
  const [state, action] = useActionState(createHostInvitation, {} as InvitationActionState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="token" value={token} />
    <h2>Invite a guest</h2>
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row"><label>First name<input name="firstName" required disabled={disabled} />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" required disabled={disabled} />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <label>Email<input name="email" type="email" disabled={disabled} />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" disabled={disabled} />{error("phone") && <small>{error("phone")}</small>}</label>
    <input type="hidden" name="groupId" value="" />
    <p className="form-hint">Gather will create a secure link for you to share.</p>
    <SubmitButton pendingText="Creating invitation…" disabled={disabled}>Create invitation</SubmitButton>
  </form>;
}
