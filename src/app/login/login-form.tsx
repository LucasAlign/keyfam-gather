"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action] = useActionState(login, initialState);
  return <form action={action} className="form-card">
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <label>Email<input name="email" type="email" autoComplete="username" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
  </form>;
}
