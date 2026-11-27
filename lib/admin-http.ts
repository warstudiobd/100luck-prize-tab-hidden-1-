/**
 * Shared helpers for the admin API surface.
 * The separate React admin panel (sonali7-admin) authenticates with a short-lived
 * signed admin token (Authorization: Bearer) obtained from /api/admin/token.
 * Browser-based calls also allow the existing is_admin session cookie so the
 * same routes work same-origin. Every admin route goes through resolveAdmin(),
 * which re-checks users.is_admin (and is_blocked) in the database on each call.
 */
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "insecure_dev_secret_change_me";
const ADMIN_ISSUER = "sonali7-admin";
export const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface AdminIdentity { id: number; username: string }

export function signAdminToken(p: { sub: number; u: string }): string {
  return jwt.sign({ sub: p.sub, u: p.u, adm: true }, JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL_SECONDS,
    issuer: ADMIN_ISSUER,
  });
}

export function verifyAdminToken(token: string): { sub: number; u: string } | null {
  try {
    const p = jwt.verify(token, JWT_SECRET, { issuer: ADMIN_ISSUER }) as any;
    if (!p?.adm) return null;
    const sub = Number(p.sub);
    if (!Number.isFinite(sub)) return null;
    return { sub, u: String(p.u ?? "") };
  } catch {
    return null;
  }
}

/**
 * Why an admin request was refused.
 *  - `unauthorized`: no token, or the token is expired/invalid/forged → the client
 *    must sign in again (HTTP 401).
 *  - `forbidden`: the token is valid but that user is not an admin / is blocked
 *    (HTTP 403) — signing in again would not help.
 */
export type AdminAuthFailure = "unauthorized" | "forbidden";
export type AdminResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; reason: AdminAuthFailure };

/**
 * Bearer admin token OR is_admin session cookie; always re-validates against the DB.
 * Returns *why* it failed so routes can answer 401 (re-login) vs 403 (not an admin).
 */
export async function resolveAdminResult(req: NextRequest): Promise<AdminResult> {
  const bearer = req.headers.get("authorization");
  let id: number | null = null;
  if (bearer?.startsWith("Bearer ")) {
    const p = verifyAdminToken(bearer.slice(7).trim());
    if (p) id = p.sub;
    // A Bearer header that does not verify (expired / wrong secret / bad issuer)
    // means the panel's stored token is dead — it has to sign in again.
    if (id == null) return { ok: false, reason: "unauthorized" };
  } else {
    const sess = await getSessionUserId();
    if (sess) id = Number(sess.sub);
    if (id == null) return { ok: false, reason: "unauthorized" };
  }
  const rows = await query(
    "SELECT id, username_or_phone FROM users WHERE id = $1 AND is_admin = TRUE AND is_blocked = FALSE",
    [id]
  );
  const row = rows[0];
  return row
    ? { ok: true, admin: { id: Number(row.id), username: row.username_or_phone } }
    : { ok: false, reason: "forbidden" };
}

/** Throwing helpers used by the routes: 401 → client clears its token and re-logs in. */
export function adminAuthError(reason: AdminAuthFailure): NextResponse {
  return reason === "unauthorized"
    ? corsError("Session expired — please sign in again", 401)
    : corsError("admin only", 403);
}

/** Bearer admin token OR is_admin session cookie; always re-validates against the DB. */
export async function resolveAdmin(req: NextRequest): Promise<AdminIdentity | null> {
  const res = await resolveAdminResult(req);
  return res.ok ? res.admin : null;
}

/** CORS — admin panel is a separate origin, uses Bearer tokens (no cookies) so "*" is safe; set ADMIN_PANEL_ORIGIN to lock it down. */
const ADMIN_ORIGIN = process.env.ADMIN_PANEL_ORIGIN || "*";
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ADMIN_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function withCors<T extends NextResponse>(res: T): T {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function corsError(message: string, status: number): NextResponse {
  return corsJson({ ok: false, error: message }, status);
}
