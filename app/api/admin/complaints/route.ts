/** Admin complaint inbox — list user complaints with status filter. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED"]);

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "").trim().toUpperCase();
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page") || 1)));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(searchParams.get("pageSize") || 30))));

  const where: string[] = [];
  const params: any[] = [];
  if (STATUSES.has(status)) { params.push(status); where.push(`c.status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await query(`SELECT COUNT(*)::int AS n FROM complaints c ${whereSql}`, params);
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = await query(
    `SELECT c.id, c.subject, c.message, c.status, c.admin_note, c.created_at, c.updated_at,
            u.username_or_phone, u.phone
     FROM complaints c JOIN users u ON u.id = c.user_id
     ${whereSql}
     ORDER BY CASE c.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return corsJson({ ok: true, total: countRow.n as number, page, pageSize, complaints: rows.map(r => ({ ...r, id: Number(r.id) })) });
}
