/** Admin user search — find players by username/phone to manage. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page") || 1)));
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(searchParams.get("pageSize") || 30))));

  const where: string[] = [];
  const params: any[] = [];
  if (q) { params.push(`%${q}%`); where.push(`(username_or_phone ILIKE $${params.length} OR phone ILIKE $${params.length} OR referral_code ILIKE $${params.length})`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRow] = await query(`SELECT COUNT(*)::int AS n FROM users ${whereSql}`, params);
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const rows = await query(
    `SELECT id, username_or_phone, phone, balance_cents, currency, vip_level, is_admin, is_blocked, referral_code, created_at
     FROM users ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  /* Referral columns. The whole edge set is tiny (one nullable FK per player), so
     the roll-up is done here rather than in SQL: a recursive CTE would need cycle
     protection to be safe, and a bad `referred_by` loop must never be able to hang
     this endpoint. `visited` gives that protection for free. */
  const edges = await query(`SELECT id, referred_by, username_or_phone FROM users`);
  const parentOf = new Map<number, number | null>(
    edges.map((e: any) => [Number(e.id), e.referred_by == null ? null : Number(e.referred_by)])
  );
  const childrenOf = new Map<number, number[]>();
  for (const [id, parent] of parentOf) {
    if (parent != null && parent !== id && parentOf.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(id);
      childrenOf.set(parent, list);
    }
  }
  const totalCache = new Map<number, number>();
  const countUnder = (id: number, seen: Set<number>): number => {
    const cached = totalCache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // referrer cycle in bad data — stop instead of hanging
    seen.add(id);
    let n = 0;
    for (const child of childrenOf.get(id) ?? []) n += 1 + countUnder(child, seen);
    seen.delete(id);
    totalCache.set(id, n);
    return n;
  };

  const nameById = new Map<number, string>(
    edges.map((e: any) => [Number(e.id), String(e.username_or_phone ?? `#${e.id}`)])
  );

  return corsJson({ ok: true, total: countRow.n as number, page, pageSize, users: rows.map(u => {
    const id = Number(u.id);
    const parentId = parentOf.get(id) ?? null;
    return {
      ...u,
      id,
      balance_cents: Number(u.balance_cents),
      referred_by: parentId,
      referred_by_name: parentId != null ? (nameById.get(parentId) ?? `#${parentId}`) : null,
      direct_invites: (childrenOf.get(id) ?? []).length,
      total_invites: countUnder(id, new Set()),
    };
  }) });
}
