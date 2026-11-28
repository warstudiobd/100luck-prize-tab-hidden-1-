/** Recent completed cashier requests for the admin cashier screen. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);

  const type = new URL(req.url).searchParams.get("type")?.toUpperCase();
  if (type !== "DEPOSIT" && type !== "WITHDRAW") {
    return corsError("type must be DEPOSIT or WITHDRAW", 400);
  }

  const rows = await query(
    `SELECT cr.id, u.username_or_phone, cr.request_type, cr.channel,
            cr.trx_ref, cr.amount_cents, cr.status, cr.created_at
       FROM cashier_requests cr
       JOIN users u ON u.id = cr.user_id
      WHERE cr.request_type = $1 AND cr.status <> 'PENDING'
      ORDER BY cr.created_at DESC, cr.id DESC
      LIMIT 100`,
    [type]
  );

  return corsJson({
    ok: true,
    history: rows.map(r => ({ ...r, id: Number(r.id), amount_cents: Number(r.amount_cents) })),
  });
}
