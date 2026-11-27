/** Update / delete one announcement. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS() { return corsPreflight(); }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const id = Math.trunc(Number((await ctx.params).id));
  if (!Number.isFinite(id) || id <= 0) return corsError("valid id required", 400);

  const body = await req.json().catch(() => ({}));
  const sets: string[] = ["updated_at = now()"];
  const params: any[] = [];
  if (body.text_en != null) { const v = String(body.text_en).trim().slice(0, 300); if (!v) return corsError("text_en cannot be empty", 400); params.push(v); sets.push(`text_en = $${params.length}`); }
  if (body.text_bn != null) { params.push(String(body.text_bn).trim().slice(0, 300)); sets.push(`text_bn = $${params.length}`); }
  if (body.is_active != null) { params.push(Boolean(body.is_active)); sets.push(`is_active = $${params.length}`); }
  if (body.sort_order != null && Number.isFinite(Math.trunc(Number(body.sort_order)))) { params.push(Math.trunc(Number(body.sort_order))); sets.push(`sort_order = $${params.length}`); }
  if (body.image_url != null) { const v = sanitizeImageUrl(body.image_url); if (v === null) return corsError("image_url must be an https URL or an uploaded image", 400); params.push(v); sets.push(`image_url = $${params.length}`); }

  params.push(id);
  const rows = await query(
    `UPDATE announcements SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING id, text_en, text_bn, image_url, is_active, sort_order, created_at, updated_at`,
    params
  );
  if (!rows[0]) return corsError("announcement not found", 404);
  return corsJson({ ok: true, announcement: { ...rows[0], id: Number(rows[0].id) } });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const id = Math.trunc(Number((await ctx.params).id));
  if (!Number.isFinite(id) || id <= 0) return corsError("valid id required", 400);

  const rows = await query("DELETE FROM announcements WHERE id = $1 RETURNING id", [id]);
  if (!rows[0]) return corsError("announcement not found", 404);
  return corsJson({ ok: true, deleted: Number(rows[0].id) });
}
