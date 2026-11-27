/** Admin panel login — exchanges admin credentials for a 12h Bearer token. */
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { corsJson, corsError, corsPreflight, signAdminToken, withCors } from "@/lib/admin-http";
import { normaliseBdPhone, toIntlBdPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username_or_phone ?? body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) return corsError("username_or_phone and password are required", 400);

  // Accept the admin's username OR any written form of their phone number
  // (01852625293 / +8801852625293 / with spaces) — the account stores one of them
  // in username_or_phone and the +880 form in phone.
  const ids = [username];
  const local = normaliseBdPhone(username);
  if (local) ids.push(local, toIntlBdPhone(local));
  const rows = await query(
    `SELECT id, username_or_phone, password_hash, is_admin, is_blocked, vip_level
       FROM users WHERE username_or_phone = ANY($1::text[]) OR phone = ANY($1::text[])
      ORDER BY is_admin DESC LIMIT 1`,
    [ids]
  );
  const u = rows[0];
  const ok = u ? await bcrypt.compare(password, u.password_hash) : false;
  if (!ok) return corsError("Invalid credentials", 401);
  if (u.is_blocked) return corsError("Account is blocked", 403);
  if (!u.is_admin) return corsError("Not an admin account", 403);

  const token = signAdminToken({ sub: Number(u.id), u: u.username_or_phone });
  return corsJson({ ok: true, token, user: { id: Number(u.id), username_or_phone: u.username_or_phone, role: "admin" } });
}
