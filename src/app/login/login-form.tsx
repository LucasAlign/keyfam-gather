"use client";

import { useActionState } from "react";
import { demoLogin, login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action] = useActionState(login, initialState);
  const [demoState, demoAction] = useActionState(demoLogin, initialState);
  return <div className="form-card login-card">
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <form action={action} className="login-credentials">
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
    <div className="login-divider"><span>or</span></div>
    <form action={demoAction} className="demo-login">
      <div><strong>Explore the demo workspace</strong><p>View a sample event without using an administrator account.</p>{demoState.error && <div className="alert" role="alert">{demoState.error}</div>}</div>
      <SubmitButton pendingText="Opening demo…">Enter demo workspace</SubmitButton>
    </form>
  </div>;
}
