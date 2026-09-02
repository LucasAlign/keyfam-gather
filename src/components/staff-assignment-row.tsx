"use client";

import type { EventRole } from "@prisma/client";
import { useActionState } from "react";
import { assignEventRole, revokeEventRole, type StaffingActionState } from "@/app/staffing-actions";
import { SubmitButton } from "@/components/submit-button";
import { assignableEventRoles, eventRoleLabels, eventRoleSummaries } from "@/lib/permissions";

const initial: StaffingActionState = {};

export function StaffAssignmentRow({ eventId, userId, name, email, currentRole }: {
  eventId: string;
  userId: string;
  name: string;
  email: string;
  currentRole: EventRole | null;
}) {
  const [state, action] = useActionState(assignEventRole, initial);
  return <div className="staff-row">
    <div className="staff-identity">
      <strong>{name}</strong>
      <p>{email}{currentRole ? ` · ${eventRoleLabels[currentRole]}` : " · No event role"}</p>
      {currentRole && <small>{eventRoleSummaries[currentRole]}</small>}
    </div>
    <form action={action} className="staff-assign">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={userId} />
      <select name="role" defaultValue={currentRole ?? "VOLUNTEER"} aria-label={`Event role for ${name}`}>
        {assignableEventRoles.map((role) => <option key={role} value={role}>{eventRoleLabels[role]}</option>)}
      </select>
      <SubmitButton pendingText="Saving…">{currentRole ? "Update" : "Assign"}</SubmitButton>
    </form>
    {currentRole && <form action={revokeEventRole} className="staff-revoke">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit">Remove</button>
    </form>}
    {state.error && <small className="inline-error">{state.error}</small>}
    {state.success && <small className="inline-success">{state.success}</small>}
  </div>;
}
