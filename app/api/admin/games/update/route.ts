/** Toggle game flags: is_active, is_hot; adjust sort_order. */
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
  const id = Math.trunc(Number(body.id));
  if (!Number.isFinite(id) || id <= 0) return corsError("id required", 400);

  const sets: string[] = [];
  const params: any[] = [];
  if (typeof body.is_active === "boolean") { params.push(body.is_active); sets.push(`is_active = $${params.length}`); }
  if (typeof body.is_hot === "boolean") { params.push(body.is_hot); sets.push(`is_hot = $${params.length}`); }
  if (body.sort_order != null && Number.isFinite(Math.trunc(Number(body.sort_order)))) { params.push(Math.trunc(Number(body.sort_order))); sets.push(`sort_order = $${params.length}`); }
  if (!sets.length) return corsError("nothing to update (is_active / is_hot / sort_order)", 400);

  params.push(id);
  const rows = await query(
    `UPDATE games_catalog SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING id, game_code, title, title_bn, is_hot, is_active, sort_order`,
    params
  );
  if (!rows[0]) return corsError("game not found", 404);
  return corsJson({ ok: true, game: { ...rows[0], id: Number(rows[0].id) } });
}
