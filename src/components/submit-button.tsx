"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, disabled = false }: { children: React.ReactNode; pendingText: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button" disabled={pending || disabled}>{pending ? pendingText : children}</button>;
}
