import { RegistrationFieldType, RegistrationFieldVisibility } from "@prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegistrationFieldManager } from "./registration-field-manager";

vi.mock("@/app/registration-field-actions", () => ({ createRegistrationField: vi.fn(), retireRegistrationField: vi.fn() }));

const field = { id: "field-1", organizationId: "org-1", eventId: "event-1", key: "dietary", label: "Dietary needs", helpText: null, type: RegistrationFieldType.TEXTAREA, visibility: RegistrationFieldVisibility.PUBLIC, isRequired: false, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(), options: [] };

describe("RegistrationFieldManager", () => {
  it("renders archived fields without mutation controls", () => {
    render(<RegistrationFieldManager eventId="event-1" fields={[field]} archived />);
    expect(screen.getByText("Archived Event fields are read-only.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
  });
});
