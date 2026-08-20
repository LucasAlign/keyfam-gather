"use client";

export function PrintButton({ children }: { children: React.ReactNode }) {
  return <button type="button" className="button no-print" onClick={() => window.print()}>{children}</button>;
}
