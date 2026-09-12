"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, disabled = false }: { children: React.ReactNode; pendingText: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending || disabled} aria-busy={pending}>{pending ? pendingText : children}</button>;
}
