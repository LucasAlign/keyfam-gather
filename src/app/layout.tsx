import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Gather | Event operations for nonprofit teams", description: "Plan the room, welcome every guest, and run meaningful nonprofit events with less friction." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header><Link href="/" className="brand"><span>G</span> Gather</Link><p>Events made easier.</p></header><main>{children}</main></body></html>;
}
