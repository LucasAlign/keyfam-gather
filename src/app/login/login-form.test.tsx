import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

vi.mock("./actions", () => ({ login: vi.fn() }));

describe("LoginForm", () => {
  it("fills the public demo credentials without submitting the form", () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: "Fill demo login" }));

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue(DEMO_ACCOUNT.email);
    expect(screen.getByLabelText("Password")).toHaveValue(DEMO_ACCOUNT.password);
  });
});
