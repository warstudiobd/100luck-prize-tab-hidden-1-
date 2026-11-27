/** Admin live-chat auto-reply — read and update the single config row. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;
  const row = (await query("SELECT is_enabled, body, updated_at FROM chat_auto_reply WHERE id = 1"))[0] as any;
  return corsJson({ ok: true, auto_reply: row ?? { is_enabled: false, body: "", updated_at: null } });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const sets: string[] = ["updated_at = now()"];
  const params: any[] = [];
  if (body.is_enabled != null) { params.push(Boolean(body.is_enabled)); sets.push(`is_enabled = $${params.length}`); }
  if (body.body != null) {
    const text = String(body.body).trim().slice(0, 2000);
    if (!text) return corsError("body cannot be empty — disable auto-reply instead", 400);
    params.push(text); sets.push(`body = $${params.length}`);
  }
  const rows = await query(
    `UPDATE chat_auto_reply SET ${sets.join(", ")} WHERE id = 1 RETURNING is_enabled, body, updated_at`,
    params
  );
  if (!rows[0]) return corsError("auto-reply row missing — was the migration applied?", 404);
  return corsJson({ ok: true, auto_reply: rows[0] });
}
