import { RegistrationFieldType, RegistrationFieldVisibility, type Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";

export type FieldDefinition = {
  id: string; key: string; label: string; type: RegistrationFieldType;
  visibility: RegistrationFieldVisibility; isRequired: boolean; isActive: boolean;
  options: Array<{ value: string; label: string }>;
};

export type FieldAudience = "PUBLIC" | "HOST" | "INVITATION" | "WALK_IN" | "STAFF" | "ADMIN";
export type FieldValue = string | number | boolean | string[];
export type RegistrationAnswerValues = Record<string, string | string[]>;

export function visibleRegistrationFields(fields: FieldDefinition[], audience: FieldAudience) {
  return fields.filter((field) => field.isActive && field.visibility !== "HIDDEN" && (field.visibility === "PUBLIC" || audience === "ADMIN"));
}

// Derive a stable, storage-safe key from a human label. The client previews the
// key live from the label with this exact function, so what a coordinator sees
// is what the server persists (createRegistrationField runs the same normalizer
// on whatever key it receives).
export function slugifyFieldKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function validateFieldDefinition(input: { type: RegistrationFieldType; visibility: RegistrationFieldVisibility; isRequired: boolean; options: Array<{ value: string; label: string }> }) {
  if (input.visibility === "HIDDEN" && input.isRequired) throw new Error("A hidden field cannot be required.");
  const hasOptions = ["DROPDOWN", "RADIO", "CHECKBOX"].includes(input.type);
  if (hasOptions && input.options.length === 0) throw new Error("This field type needs at least one option.");
  if (!hasOptions && input.options.length > 0) throw new Error("Only dropdown, radio, and checkbox fields accept options.");
  const values = input.options.map(({ value }) => value.trim()).filter(Boolean);
  if (new Set(values).size !== values.length) throw new Error("Field option values must be unique.");
}

export function parseRegistrationAnswers(fields: FieldDefinition[], formData: FormData, audience: FieldAudience) {
  const visible = visibleRegistrationFields(fields, audience);
  const answers: Array<{ fieldId: string; value: Prisma.InputJsonValue }> = [];
  const errors: Record<string, string[]> = {};
  for (const field of visible) {
    const name = `custom_${field.id}`;
    const raw = field.type === "CHECKBOX" ? formData.getAll(name).map(String) : String(formData.get(name) ?? "").trim();
    const missing = Array.isArray(raw) ? raw.length === 0 : raw === "";
    if (missing) {
      if (field.isRequired) errors[name] = [`${field.label} is required.`];
      continue;
    }
    try {
      let value: FieldValue = raw;
      if (field.type === "NUMBER") {
        value = Number(raw);
        if (!Number.isFinite(value)) throw new Error("Enter a valid number.");
      } else if (field.type === "YES_NO") {
        if (raw !== "yes" && raw !== "no") throw new Error("Choose yes or no.");
        value = raw === "yes";
      } else if (field.type === "EMAIL" && normalizeEmail(String(raw)) !== String(raw).trim().toLowerCase()) throw new Error("Enter a valid email.");
      else if (field.type === "EMAIL" && !/^\S+@\S+\.\S+$/.test(String(raw))) throw new Error("Enter a valid email.");
      else if (field.type === "PHONE" && normalizePhone(String(raw)).length < 7) throw new Error("Enter a valid phone number.");
      else if (field.type === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw new Error("Enter a valid date.");
      if (["DROPDOWN", "RADIO"].includes(field.type) && !field.options.some((option) => option.value === value)) throw new Error("Choose a valid option.");
      if (field.type === "CHECKBOX" && (value as string[]).some((item) => !field.options.some((option) => option.value === item))) throw new Error("Choose valid options.");
      answers.push({ fieldId: field.id, value: value as Prisma.InputJsonValue });
    } catch (error) { errors[name] = [error instanceof Error ? error.message : "Enter a valid value."]; }
  }
  return Object.keys(errors).length ? { success: false as const, errors } : { success: true as const, answers };
}

export function registrationAnswerValues(input: FormData | Record<string, unknown>): RegistrationAnswerValues {
  const result: RegistrationAnswerValues = {};
  if (input instanceof FormData) {
    for (const key of new Set(Array.from(input.keys()).filter((item) => item.startsWith("custom_")))) {
      const values = input.getAll(key).map(String);
      result[key] = values.length > 1 ? values : values[0] ?? "";
    }
    return result;
  }
  for (const [key, value] of Object.entries(input)) {
    if (!key.startsWith("custom_") || value == null) continue;
    result[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return result;
}

export function parseRegistrationAnswerValues(fields: FieldDefinition[], values: RegistrationAnswerValues, audience: FieldAudience) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) formData.append(key, item);
  }
  return parseRegistrationAnswers(fields, formData, audience);
}

export function displayFieldAnswer(field: Pick<FieldDefinition, "type" | "options">, value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => field.options.find((option) => option.value === item)?.label ?? String(item)).join("; ");
  if (["DROPDOWN", "RADIO"].includes(field.type)) return field.options.find((option) => option.value === value)?.label ?? String(value ?? "");
  return String(value ?? "");
}
