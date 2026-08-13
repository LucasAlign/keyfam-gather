"use client";
import { useActionState } from "react";
import { registerHostGuest, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
export function HostGuestForm({ token, disabled }: { token: string; disabled: boolean }) {
  const [state, action] = useActionState(registerHostGuest, {} as ActionState); const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card"><input type="hidden" name="token" value={token} />{state.error && <div className="alert" role="alert">{state.error}</div>}<div className="field-row"><label>First name<input name="firstName" required disabled={disabled} />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" required disabled={disabled} />{error("lastName") && <small>{error("lastName")}</small>}</label></div><label>Email<input name="email" type="email" disabled={disabled} />{error("email") && <small>{error("email")}</small>}</label><label>Phone<input name="phone" type="tel" disabled={disabled} />{error("phone") && <small>{error("phone")}</small>}</label><p className="form-hint">Add an email or phone so Gather can safely match an existing person.</p><SubmitButton pendingText="Adding guest…" disabled={disabled}>Add guest</SubmitButton></form>;
}
