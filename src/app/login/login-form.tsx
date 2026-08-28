"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action] = useActionState(login, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return <div className="form-card login-card">
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    <form action={action} className="login-credentials">
      <label>Email<input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
    <div className="login-divider"><span>or</span></div>
    <div className="demo-login">
      <div><strong>Explore the demo workspace</strong><p>View a sample event without using an administrator account.</p></div>
      <button className="button secondary" type="button" onClick={() => {
        setEmail(DEMO_ACCOUNT.email);
        setPassword(DEMO_ACCOUNT.password);
      }}>Fill demo login</button>
    </div>
  </div>;
}
