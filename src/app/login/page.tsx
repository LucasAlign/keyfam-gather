import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <div className="narrow"><p className="eyebrow">Welcome back</p><h1>Sign in to Gather</h1><p className="lede">Enter your account email and password to continue.</p><LoginForm /></div>;
}
