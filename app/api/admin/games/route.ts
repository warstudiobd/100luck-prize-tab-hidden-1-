/** Admin game catalog list — search, filter, paginate (includes inactive games). */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { GAME_CATEGORIES } from "@/lib/types";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const category = (searchParams.get("category") || "").trim().toUpperCase();
  const provider = (searchParams.get("provider") || "").trim().toUpperCase();
  const active = searchParams.get("active"); // "true" | "false" | null (all)
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page") || 1)));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(searchParams.get("pageSize") || 30))));

  const where: string[] = [];
  const params: any[] = [];
  if (category && (GAME_CATEGORIES as readonly string[]).includes(category)) { params.push(category); where.push(`category = $${params.length}`); }
  if (provider && provider !== "ALL") { params.push(provider); where.push(`provider_code = $${params.length}`); }
  if (active === "true") where.push("is_active = TRUE");
  else if (active === "false") where.push("is_active = FALSE");
  if (q) { params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR title_bn ILIKE $${params.length} OR game_code ILIKE $${params.length})`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await query(`SELECT COUNT(*)::int AS n FROM games_catalog ${whereSql}`, params);
  const total = countRow.n as number;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = await query(
    `SELECT id, provider_code, game_code, title, title_bn, category, thumbnail_url, is_hot, is_active, sort_order
     FROM games_catalog ${whereSql}
     ORDER BY is_hot DESC, sort_order ASC, id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return corsJson({ ok: true, total, page, pageSize, games: rows.map(g => ({ ...g, id: Number(g.id) })) });
}
