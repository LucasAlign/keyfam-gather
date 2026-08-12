"use client";

import { useActionState } from "react";
import { registerPerson, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export function RegistrationForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(registerPerson, {} as ActionState);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card">
    <input type="hidden" name="eventId" value={eventId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row">
      <label>First name<input name="firstName" autoComplete="given-name" required />{error("firstName") && <small>{error("firstName")}</small>}</label>
      <label>Last name<input name="lastName" autoComplete="family-name" required />{error("lastName") && <small>{error("lastName")}</small>}</label>
    </div>
    <label>Email<input name="email" type="email" autoComplete="email" />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" autoComplete="tel" />{error("phone") && <small>{error("phone")}</small>}</label>
    <p className="form-hint">Gather matches exact email or phone records and will reuse an existing person when it is safe.</p>
    <SubmitButton pendingText="Registering…">Register person</SubmitButton>
  </form>;
}
