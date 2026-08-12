import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Gather", description: "Events made easier." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header><Link href="/" className="brand"><span>G</span> Gather</Link><p>Events made easier.</p></header><main>{children}</main></body></html>;
}
