import { describe, expect, it } from "vitest";
import { displayFieldAnswer, parseRegistrationAnswers, validateFieldDefinition, visibleRegistrationFields, type FieldDefinition } from "./registration-fields";

const fields: FieldDefinition[] = [
  { id: "text", key: "note", label: "Note", type: "TEXT", visibility: "PUBLIC", isRequired: true, isActive: true, options: [] },
  { id: "check", key: "needs", label: "Needs", type: "CHECKBOX", visibility: "PUBLIC", isRequired: false, isActive: true, options: [{ value: "ramp", label: "Ramp" }, { value: "asl", label: "ASL" }] },
  { id: "admin", key: "rating", label: "Rating", type: "NUMBER", visibility: "ADMIN_ONLY", isRequired: false, isActive: true, options: [] },
  { id: "hidden", key: "legacy", label: "Legacy", type: "TEXT", visibility: "HIDDEN", isRequired: false, isActive: true, options: [] },
];

describe("registration fields module interface", () => {
  it("applies the audience visibility matrix", () => {
    expect(visibleRegistrationFields(fields, "PUBLIC").map(({ id }) => id)).toEqual(["text", "check"]);
    expect(visibleRegistrationFields(fields, "ADMIN").map(({ id }) => id)).toEqual(["text", "check", "admin"]);
  });
  it("rejects contradictory definitions and option shapes", () => {
    expect(() => validateFieldDefinition({ type: "TEXT", visibility: "HIDDEN", isRequired: true, options: [] })).toThrow("hidden");
    expect(() => validateFieldDefinition({ type: "DROPDOWN", visibility: "PUBLIC", isRequired: false, options: [] })).toThrow("option");
  });
  it("validates and types applicable answers", () => {
    const missing = parseRegistrationAnswers(fields, new FormData(), "PUBLIC");
    expect(missing).toMatchObject({ success: false, errors: { custom_text: ["Note is required."] } });
    const data = new FormData(); data.set("custom_text", "Hello"); data.append("custom_check", "ramp"); data.append("custom_check", "asl"); data.set("custom_admin", "4.5");
    expect(parseRegistrationAnswers(fields, data, "ADMIN")).toEqual({ success: true, answers: [{ fieldId: "text", value: "Hello" }, { fieldId: "check", value: ["ramp", "asl"] }, { fieldId: "admin", value: 4.5 }] });
  });
  it("formats option arrays without exposing storage values", () => expect(displayFieldAnswer(fields[1], ["ramp", "asl"])).toBe("Ramp; ASL"));
});
