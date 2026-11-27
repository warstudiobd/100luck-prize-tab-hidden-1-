/** Update / delete one site popup. */
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
  const text = (key: string, max: number) => {
    if (body[key] == null) return;
    params.push(String(body[key]).trim().slice(0, max)); sets.push(`${key} = $${params.length}`);
  };
  text("title_en", 120); text("title_bn", 120); text("body_en", 600); text("body_bn", 600);
  if (body.is_active != null) { params.push(Boolean(body.is_active)); sets.push(`is_active = $${params.length}`); }
  if (body.image_url != null) { const v = sanitizeImageUrl(body.image_url); if (v === null) return corsError("image_url must be an https URL or an uploaded image", 400); params.push(v); sets.push(`image_url = $${params.length}`); }

  params.push(id);
  const rows = await query(
    `UPDATE site_popups SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING id, title_en, title_bn, body_en, body_bn, image_url, is_active, created_at, updated_at`,
    params
  );
  if (!rows[0]) return corsError("popup not found", 404);
  return corsJson({ ok: true, popup: { ...rows[0], id: Number(rows[0].id) } });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const id = Math.trunc(Number((await ctx.params).id));
  if (!Number.isFinite(id) || id <= 0) return corsError("valid id required", 400);

  const rows = await query("DELETE FROM site_popups WHERE id = $1 RETURNING id", [id]);
  if (!rows[0]) return corsError("popup not found", 404);
  return corsJson({ ok: true, deleted: Number(rows[0].id) });
}
