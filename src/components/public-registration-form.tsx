"use client";

import { useActionState } from "react";
import { registerPublic, type PublicRegistrationState } from "@/app/public-registration-actions";
import { RegistrationFieldInputs } from "@/components/registration-field-inputs";
import { SubmitButton } from "@/components/submit-button";
import type { FieldDefinition } from "@/lib/registration-fields";

export function PublicRegistrationForm({ eventId, fields }: { eventId: string; fields: FieldDefinition[] }) {
  const [state, action] = useActionState(registerPublic, {} as PublicRegistrationState);
  const error = (name: string) => state.fields?.[name]?.[0];

  if (state.success) {
    return <section className="empty compact registration-complete" role="status">
      <div className="empty-icon">✓</div>
      <h2>You&apos;re registered</h2>
      <p>Your registration is confirmed. You can close this page.</p>
    </section>;
  }

  return <form action={action} className="form-card">
    <input type="hidden" name="eventId" value={eventId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <div className="field-row">
      <label>First name<input name="firstName" required />{error("firstName") && <small>{error("firstName")}</small>}</label>
      <label>Last name<input name="lastName" required />{error("lastName") && <small>{error("lastName")}</small>}</label>
    </div>
    <label>Email<input name="email" type="email" />{error("email") && <small>{error("email")}</small>}</label>
    <label>Phone<input name="phone" type="tel" />{error("phone") && <small>{error("phone")}</small>}</label>
    <RegistrationFieldInputs fields={fields} errors={state.fields} />
    <SubmitButton pendingText="Registering…">Register</SubmitButton>
  </form>;
}
