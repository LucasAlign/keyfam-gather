"use client";

import { useActionState } from "react";
import {
  cancelHostRegistration,
  cancelStaffRegistration,
  reactivateHostRegistration,
  reactivateStaffRegistration,
  updateHostRegistration,
  updateStaffRegistration,
  type RegistrationActionState,
} from "@/app/registration-actions";
import { SubmitButton } from "@/components/submit-button";

type RegistrationEditorProps = {
  registration: {
    id: string;
    status: "ACTIVE" | "CANCELLED" | "SUPERSEDED";
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  context: { kind: "staff"; eventId: string } | { kind: "host"; token: string };
};

function ContextFields({ context, registrationId }: { context: RegistrationEditorProps["context"]; registrationId: string }) {
  return <><input type="hidden" name="registrationId" value={registrationId} />{context.kind === "staff" ? <input type="hidden" name="eventId" value={context.eventId} /> : <input type="hidden" name="token" value={context.token} />}</>;
}

export function RegistrationEditor({ registration, context }: RegistrationEditorProps) {
  const updateAction = context.kind === "staff" ? updateStaffRegistration : updateHostRegistration;
  const cancelAction = context.kind === "staff" ? cancelStaffRegistration : cancelHostRegistration;
  const reactivateAction = context.kind === "staff" ? reactivateStaffRegistration : reactivateHostRegistration;
  const [updateState, updateForm] = useActionState(updateAction, {} as RegistrationActionState);
  const [cancelState, cancelForm] = useActionState(cancelAction, {} as RegistrationActionState);
  const [reactivateState, reactivateForm] = useActionState(reactivateAction, {} as RegistrationActionState);
  const fieldError = (name: string) => updateState.fields?.[name]?.[0];
  const lifecycleState = registration.status === "ACTIVE" ? cancelState : reactivateState;
  if (registration.status === "SUPERSEDED") return <p className="form-hint">This historical registration was superseded during person resolution and cannot be edited.</p>;

  return <details className="registration-editor">
    <summary>{registration.status === "ACTIVE" ? "Edit or cancel" : "Review cancelled registration"}</summary>
    {updateState.error && <div className="alert" role="alert">{updateState.error}</div>}
    {updateState.success && <div className="success" role="status">{updateState.success}</div>}
    {lifecycleState.error && <div className="alert" role="alert">{lifecycleState.error}</div>}
    {lifecycleState.success && <div className="success" role="status">{lifecycleState.success}</div>}
    <form action={updateForm} className="registration-edit-form">
      <ContextFields context={context} registrationId={registration.id} />
      <div className="field-row"><label>First name<input name="firstName" defaultValue={registration.firstName} required />{fieldError("firstName") && <small>{fieldError("firstName")}</small>}</label><label>Last name<input name="lastName" defaultValue={registration.lastName} required />{fieldError("lastName") && <small>{fieldError("lastName")}</small>}</label></div>
      <div className="field-row"><label>Email<input name="email" type="email" defaultValue={registration.email ?? ""} />{fieldError("email") && <small>{fieldError("email")}</small>}</label><label>Phone<input name="phone" type="tel" defaultValue={registration.phone ?? ""} />{fieldError("phone") && <small>{fieldError("phone")}</small>}</label></div>
      <SubmitButton pendingText="Saving…">Save details</SubmitButton>
    </form>
    {registration.status === "ACTIVE" ? <form action={cancelForm} className="registration-lifecycle-form"><ContextFields context={context} registrationId={registration.id} /><p>Cancelling removes this guest from capacity, seating, check-in, name tags, and no-show counts. The record remains auditable and can be restored.</p><SubmitButton pendingText="Cancelling…">Cancel registration</SubmitButton></form> : <form action={reactivateForm} className="registration-lifecycle-form"><ContextFields context={context} registrationId={registration.id} /><p>Restoring reuses the previous group and seating assignments only when capacity still allows them.</p><SubmitButton pendingText="Restoring…">Restore registration</SubmitButton></form>}
  </details>;
}
