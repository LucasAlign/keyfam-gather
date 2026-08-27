import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { logout } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = { title: "Gather", description: "Events made easier." };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const signedIn = Boolean(cookieStore.get(SESSION_COOKIE)?.value);
  return <html lang="en"><body><header><Link href="/" className="brand"><span>G</span> Gather</Link><div className="header-right"><p>Events made easier.</p>{signedIn ? <form action={logout} className="sign-out"><button className="link" type="submit">Sign out</button></form> : null}</div></header><main>{children}</main></body></html>;
}
