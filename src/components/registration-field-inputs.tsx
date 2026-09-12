import type { FieldDefinition } from "@/lib/registration-fields";

export function RegistrationFieldInputs({ fields, errors }: { fields: FieldDefinition[]; errors?: Record<string, string[]> }) {
  return fields.filter((field) => field.isActive && field.visibility !== "HIDDEN").map((field) => {
    const name = `custom_${field.id}`;
    const message = errors?.[name]?.[0];
    if (field.type === "TEXTAREA") return <label key={field.id}>{field.label}<textarea name={name} required={field.isRequired}/>{message && <small>{message}</small>}</label>;
    if (["DROPDOWN", "RADIO", "CHECKBOX"].includes(field.type)) return <fieldset key={field.id}><legend>{field.label}</legend>{field.type === "DROPDOWN"
      ? <select name={name} required={field.isRequired}><option value="">Choose…</option>{field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
      : field.options.map((option) => <label className="choice" key={option.value}><input type={field.type === "RADIO" ? "radio" : "checkbox"} name={name} value={option.value} required={field.type === "RADIO" && field.isRequired}/>{option.label}</label>)}{message && <small>{message}</small>}</fieldset>;
    if (field.type === "YES_NO") return <label key={field.id}>{field.label}<select name={name} required={field.isRequired}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>{message && <small>{message}</small>}</label>;
    const type = field.type === "NUMBER" ? "number" : field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "DATE" ? "date" : "text";
    return <label key={field.id}>{field.label}<input name={name} type={type} required={field.isRequired}/>{message && <small>{message}</small>}</label>;
  });
}
