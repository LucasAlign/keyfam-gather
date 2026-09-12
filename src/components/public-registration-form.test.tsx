import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicRegistrationForm } from "./public-registration-form";

const { registerPublic } = vi.hoisted(() => ({ registerPublic: vi.fn() }));
vi.mock("@/app/public-registration-actions", () => ({ registerPublic }));

describe("PublicRegistrationForm", () => {
  it("replaces the form with a terminal confirmation after registration", async () => {
    registerPublic.mockResolvedValueOnce({ success: "You're registered." });
    render(<PublicRegistrationForm eventId="event-1" fields={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "First name" }), { target: { value: "Avery" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Last name" }), { target: { value: "Morgan" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "avery@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "You're registered" })).toBeVisible());
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });
});
