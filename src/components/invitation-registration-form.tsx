"use client";

import { useActionState } from "react";
import { registerFromInvitation, type InvitationActionState } from "@/app/invitation-actions";
import { SubmitButton } from "@/components/submit-button";

export function InvitationRegistrationForm({ token, invitation }: { token: string; invitation: { firstName: string; lastName: string; email: string | null; phone: string | null } }) {
  const [state, action] = useActionState(registerFromInvitation, {} as InvitationActionState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="token" value={token} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row"><label>First name<input name="firstName" defaultValue={invitation.firstName} required />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" defaultValue={invitation.lastName} required />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <label>Email<input name="email" type="email" defaultValue={invitation.email ?? ""} />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" defaultValue={invitation.phone ?? ""} />{error("phone") && <small>{error("phone")}</small>}</label>
    <SubmitButton pendingText="Registering…">Register</SubmitButton>
  </form>;
}
