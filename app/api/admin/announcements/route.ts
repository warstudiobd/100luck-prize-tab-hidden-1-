/** Admin announcements — list all (incl. inactive) and create new. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;
  const rows = await query(
    "SELECT id, text_en, text_bn, image_url, is_active, sort_order, created_at, updated_at FROM announcements ORDER BY is_active DESC, sort_order ASC, id ASC"
  );
  return corsJson({ ok: true, announcements: rows.map(r => ({ ...r, id: Number(r.id) })) });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const text_en = String(body.text_en ?? "").trim().slice(0, 300);
  const text_bn = String(body.text_bn ?? "").trim().slice(0, 300);
  const image_url = sanitizeImageUrl(body.image_url);
  if (image_url === null) return corsError("image_url must be an https URL or an uploaded image (max ~400 KB)", 400);
  const is_active = body.is_active === undefined ? true : Boolean(body.is_active);
  const sort_order = Number.isFinite(Math.trunc(Number(body.sort_order))) ? Math.trunc(Number(body.sort_order)) : 100;
  if (!text_en) return corsError("text_en is required", 400);

  const rows = await query(
    `INSERT INTO announcements (text_en, text_bn, image_url, is_active, sort_order) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, text_en, text_bn, image_url, is_active, sort_order, created_at, updated_at`,
    [text_en, text_bn, image_url, is_active, sort_order]
  );
  return corsJson({ ok: true, announcement: { ...rows[0], id: Number(rows[0].id) } });
}
