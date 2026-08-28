"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { enforceIpRateLimit } from "@/lib/rate-limit-request";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session";
import { logger, serializeError } from "@/lib/logger";

export type LoginState = { error?: string };

// A fixed hash verified when no user (or no password) is found so that a missing
// account and a wrong password take comparable time and do not leak which failed.
const TIMING_GUARD_HASH = hashPassword("gather-timing-guard");

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const secret = process.env.AUTH_SESSION_SECRET ?? process.env.DEMO_AUTH_SECRET;
  if (!secret || secret.length < 32) return { error: "Authentication is not configured." };
  if (!email || !password) return { error: "Enter your email and password." };

  let user;
  try {
    const limit = await enforceIpRateLimit("login", 10, 5 * 60 * 1000);
    if (!limit.allowed) return { error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
    user = await db.user.findUnique({ where: { email } });
  } catch (error) {
    logger.error("Login dependency failure", serializeError(error));
    return { error: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  const passwordCorrect = user?.passwordHash
    ? verifyPassword(password, user.passwordHash)
    : (verifyPassword(password, TIMING_GUARD_HASH), false);
  if (!user || !passwordCorrect) return { error: "Email or password is incorrect." };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSession({ email: user.email, version: user.sessionVersion }, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect("/events");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
