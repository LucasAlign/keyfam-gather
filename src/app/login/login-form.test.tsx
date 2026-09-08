import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const { login, demoLogin } = vi.hoisted(() => ({
  login: vi.fn().mockResolvedValue({}),
  demoLogin: vi.fn().mockResolvedValue({}),
}));
vi.mock("./actions", () => ({ login, demoLogin }));

describe("LoginForm", () => {
  it("signs into the public demo workspace in one click", async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: "Enter demo workspace" }));

    // The demo button submits its own form straight to the demo sign-in action
    // rather than only filling the credential fields the visitor must then send.
    await waitFor(() => expect(demoLogin).toHaveBeenCalled());
    expect(login).not.toHaveBeenCalled();
  });
});
