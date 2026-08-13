import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <div className="narrow"><p className="eyebrow">Development access</p><h1>Sign in to Gather</h1><p className="lede">Use the local development account configured for this environment.</p><LoginForm /></div>;
}
