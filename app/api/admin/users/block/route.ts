/** Block / unblock a user. Admins and the acting admin cannot be blocked. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.user_id));
  const blocked = Boolean(body.blocked);
  if (!Number.isFinite(id) || id <= 0) return corsError("user_id required", 400);

  const rows = await query("SELECT id, is_admin, is_blocked FROM users WHERE id = $1", [id]);
  const u = rows[0];
  if (!u) return corsError("user not found", 404);
  if (u.is_admin) return corsError("cannot block an admin account", 400);
  if (id === admin.id) return corsError("cannot block yourself", 400);

  await query("UPDATE users SET is_blocked = $1 WHERE id = $2", [blocked, id]);
  return corsJson({ ok: true, user_id: id, is_blocked: blocked });
}
