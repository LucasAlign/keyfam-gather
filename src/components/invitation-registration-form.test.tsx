import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvitationRegistrationForm } from "./invitation-registration-form";

vi.mock("@/app/invitation-actions", () => ({ registerFromInvitation: vi.fn() }));

describe("InvitationRegistrationForm", () => {
  it("prefills every supplied invitee contact field", () => {
    render(<InvitationRegistrationForm token="invite-token" invitation={{ firstName: "Casey", lastName: "Nguyen", email: "casey@example.test", phone: "615-555-0101" }} fields={[]} />);
    expect(screen.getByRole("textbox", { name: "First name" })).toHaveValue("Casey");
    expect(screen.getByRole("textbox", { name: "Last name" })).toHaveValue("Nguyen");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("casey@example.test");
    expect(screen.getByRole("textbox", { name: "Phone" })).toHaveValue("615-555-0101");
  });

  it("renders public custom fields on the invitation path", () => {
    render(<InvitationRegistrationForm token="invite-token" invitation={{ firstName: "Casey", lastName: "Nguyen", email: "casey@example.test", phone: "615-555-0101" }} fields={[{
      id: "dietary", key: "dietary", label: "Dietary accommodations", type: "TEXTAREA", visibility: "PUBLIC", isRequired: true, isActive: true, options: [],
    }]} />);

    expect(screen.getByRole("textbox", { name: "Dietary accommodations" })).toBeRequired();
  });
});
