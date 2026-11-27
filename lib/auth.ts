import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "sonali7_token";
/**
 * v55 "remember me".
 *
 * Two lifetimes, one cookie name:
 *   • remember me ticked  → 400 days (the longest a browser will keep a cookie
 *     without re-asking, and what Chrome's cookie cap allows);
 *   • unticked            → 12 hours, i.e. "this sitting only".
 * The chosen lifetime is baked into the JWT itself (`rem`), so the server can
 * never honour a long cookie after a short login, and vice versa.
 * The signed-in phone number is also stashed in a NON-httpOnly cookie
 * (`sonali7_last_user`) purely so the login form can prefill it next time.
 */
export const LAST_USER_COOKIE = "sonali7_last_user";
export const REMEMBER_DAYS = 400;      // ~13 months, the browser maximum
export const SESSION_HOURS = 12;       // no remember-me

const JWT_SECRET = process.env.JWT_SECRET || "insecure_dev_secret_change_me";

export interface JwtPayload { sub: number; u: string; adm: boolean; rem?: boolean }

export function signSession(p: JwtPayload, remember = false): string {
  return jwt.sign({ ...p, rem: remember }, JWT_SECRET, {
    expiresIn: remember ? `${REMEMBER_DAYS}d` : `${SESSION_HOURS}h`,
  });
}
export function verifySession(token: string): JwtPayload | null {
  try { return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload; } catch { return null; }
}
/** Read the logged-in user id from the request cookies (Route Handlers). */
export async function getSessionUserId(): Promise<JwtPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}
/** Set the session cookie with the lifetime that matches the player's choice. */
export function setSessionCookie(res: NextResponse, token: string, remember = false) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * REMEMBER_DAYS : 60 * 60 * SESSION_HOURS,
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { expires: new Date(Date.now() + REMEMBER_DAYS * 864e5) } : {}),
  });
}

/**
 * Remember only the *identity* (phone number) for the next visit, never the
 * credential. Readable by JS on purpose — it holds nothing secret and lets the
 * login modal greet the player with their number already filled in.
 */
export function setLastUserCookie(res: NextResponse, username: string, remember = false) {
  res.cookies.set(LAST_USER_COOKIE, username, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * REMEMBER_DAYS : 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  // the remembered identity survives a logout on purpose: "remember me" should
  // not be forgotten just because the player signed out of one device session.
}
export function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
}
