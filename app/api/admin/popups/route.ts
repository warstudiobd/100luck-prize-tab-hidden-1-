/** Admin popups — list all (incl. inactive) and create. */
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
    "SELECT id, title_en, title_bn, body_en, body_bn, image_url, is_active, created_at, updated_at FROM site_popups ORDER BY is_active DESC, updated_at DESC, id DESC LIMIT 50"
  );
  return corsJson({ ok: true, popups: rows.map(r => ({ ...r, id: Number(r.id) })) });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const title_en = String(body.title_en ?? "").trim().slice(0, 120);
  const title_bn = String(body.title_bn ?? "").trim().slice(0, 120);
  const body_en  = String(body.body_en  ?? "").trim().slice(0, 600);
  const body_bn  = String(body.body_bn  ?? "").trim().slice(0, 600);
  const image_url = sanitizeImageUrl(body.image_url);
  if (image_url === null) return corsError("image_url must be an https URL or an uploaded image (max ~400 KB)", 400);
  if (!body_en && !body_bn && !image_url) return corsError("add an English or Bangla message, or an image", 400);
  const is_active = body.is_active === undefined ? true : Boolean(body.is_active);

  const rows = await query(
    `INSERT INTO site_popups (title_en, title_bn, body_en, body_bn, image_url, is_active)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, title_en, title_bn, body_en, body_bn, image_url, is_active, created_at, updated_at`,
    [title_en, title_bn, body_en, body_bn, image_url, is_active]
  );
  return corsJson({ ok: true, popup: { ...rows[0], id: Number(rows[0].id) } });
}
