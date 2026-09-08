"use client";

import { useActionState, useState } from "react";
import { registerFromInvitation, type InvitationActionState } from "@/app/invitation-actions";
import { SubmitButton } from "@/components/submit-button";

export function InvitationRegistrationForm({ token, invitation }: { token: string; invitation: { firstName: string; lastName: string; email: string | null; phone: string | null } }) {
  const [state, action] = useActionState(registerFromInvitation, {} as InvitationActionState);
  const [contact, setContact] = useState({ firstName: invitation.firstName, lastName: invitation.lastName, email: invitation.email ?? "", phone: invitation.phone ?? "" });
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="token" value={token} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row"><label>First name<input name="firstName" value={contact.firstName} onChange={(event) => setContact((current) => ({ ...current, firstName: event.target.value }))} required />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" value={contact.lastName} onChange={(event) => setContact((current) => ({ ...current, lastName: event.target.value }))} required />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <label>Email<input name="email" type="email" value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} />{error("phone") && <small>{error("phone")}</small>}</label>
    <SubmitButton pendingText="Registering…">Register</SubmitButton>
  </form>;
}
