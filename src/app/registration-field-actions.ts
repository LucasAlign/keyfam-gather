"use server";

import { RegistrationFieldType, RegistrationFieldVisibility } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugifyFieldKey, validateFieldDefinition } from "@/lib/registration-fields";

export type RegistrationFieldActionState = { error?: string; success?: string; values?: Record<string, string>; token?: string };

// A fresh token on each return remounts the "Add a field" form so React 19
// re-hydrates its uncontrolled inputs; `values` carries the raw submission so a
// failed add re-renders what the coordinator typed instead of an empty form.
function fieldState(state: RegistrationFieldActionState): RegistrationFieldActionState {
  return { ...state, token: Math.random().toString(36).slice(2) };
}

function submittedFieldValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of ["label", "key", "helpText", "type", "visibility", "options"]) values[name] = String(formData.get(name) ?? "");
  values.isRequired = formData.get("isRequired") === "on" ? "on" : "";
  return values;
}

export async function createRegistrationField(_: RegistrationFieldActionState, formData: FormData): Promise<RegistrationFieldActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  // Fall back to the label when the key field is left blank: the client derives
  // it from the label with slugifyFieldKey, but a keyboard-only submission may
  // arrive without it.
  const key = slugifyFieldKey(String(formData.get("key") ?? "") || label);
  const type = String(formData.get("type") ?? "") as RegistrationFieldType;
  const visibility = String(formData.get("visibility") ?? "") as RegistrationFieldVisibility;
  const isRequired = formData.get("isRequired") === "on";
  const options = String(formData.get("options") ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [value, ...rest] = line.split("|"); return { value: value.trim(), label: (rest.join("|") || value).trim() }; });
  if (!eventId || !label || !key || !Object.values(RegistrationFieldType).includes(type) || !Object.values(RegistrationFieldVisibility).includes(visibility)) return fieldState({ error: "Review the field details.", values: submittedFieldValues(formData) });
  try {
    validateFieldDefinition({ type, visibility, isRequired, options });
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, status: true, registrationFields: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 } } });
    if (!event) throw new Error("This event no longer exists.");
    if (event.status === "ARCHIVED") throw new Error("Archived events are read-only.");
    const { user } = await requireActor(event.organizationId, "event:manage", eventId);
    await db.$transaction(async (tx) => {
      const field = await tx.eventRegistrationField.create({ data: { organizationId: event.organizationId, eventId, key, label, helpText: String(formData.get("helpText") ?? "").trim() || null, type, visibility, isRequired, sortOrder: (event.registrationFields[0]?.sortOrder ?? -1) + 1, options: { create: options.map((option, sortOrder) => ({ ...option, sortOrder })) } } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "registration_field.created", entityType: "EventRegistrationField", entityId: field.id, newState: JSON.stringify(field) } });
    });
    revalidatePath(`/events/${eventId}/settings`);
    return fieldState({ success: "Registration field added." });
  } catch (error) { return fieldState({ error: error instanceof Error ? error.message : "We couldn't add this field.", values: submittedFieldValues(formData) }); }
}

export async function retireRegistrationField(_: RegistrationFieldActionState, formData: FormData): Promise<RegistrationFieldActionState> {
  const eventId = String(formData.get("eventId") ?? ""); const fieldId = String(formData.get("fieldId") ?? "");
  try {
    const field = await db.eventRegistrationField.findFirst({ where: { id: fieldId, eventId }, select: { organizationId: true, event: { select: { status: true } } } });
    if (!field) throw new Error("This field is no longer available.");
    if (field.event.status === "ARCHIVED") throw new Error("Archived events are read-only.");
    const { user } = await requireActor(field.organizationId, "event:manage", eventId);
    await db.$transaction(async (tx) => { await tx.eventRegistrationField.update({ where: { id: fieldId }, data: { isActive: false } }); await tx.auditLog.create({ data: { organizationId: field.organizationId, eventId, actorId: user.id, action: "registration_field.retired", entityType: "EventRegistrationField", entityId: fieldId } }); });
    revalidatePath(`/events/${eventId}/settings`); return { success: "Registration field hidden from future forms." };
  } catch (error) { return { error: error instanceof Error ? error.message : "We couldn't retire this field." }; }
}
