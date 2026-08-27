"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDemoSession, credentialsMatch, DEMO_SESSION_COOKIE } from "@/lib/demo-session";

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const expectedEmail = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  const expectedPassword = process.env.DEMO_AUTH_PASSWORD;
  const secret = process.env.DEMO_AUTH_SECRET;
  if (!expectedEmail || !expectedPassword || !secret) return { error: "Development authentication is not configured." };
  if (!credentialsMatch(email, expectedEmail) || !credentialsMatch(password, expectedPassword)) return { error: "Email or password is incorrect." };

  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, createDemoSession(email, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/events");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  redirect("/login");
}
