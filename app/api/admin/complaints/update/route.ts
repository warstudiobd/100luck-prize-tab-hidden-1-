/** Update a complaint's status and admin note. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED"]);

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.id));
  const status = String(body.status ?? "").trim().toUpperCase();
  const admin_note = String(body.admin_note ?? "").trim().slice(0, 2000);
  if (!Number.isFinite(id) || id <= 0) return corsError("id required", 400);
  if (!STATUSES.has(status)) return corsError("status must be OPEN, IN_PROGRESS or RESOLVED", 400);

  const rows = await query(
    `UPDATE complaints SET status = $1, admin_note = $2, updated_at = now() WHERE id = $3
     RETURNING id, status, admin_note, updated_at`,
    [status, admin_note, id]
  );
  if (!rows[0]) return corsError("complaint not found", 404);
  return corsJson({ ok: true, complaint: { ...rows[0], id: Number(rows[0].id) } });
}
