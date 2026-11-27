/** Admin pending cashier queue — optional ?type=DEPOSIT|WITHDRAW filter. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const type = new URL(req.url).searchParams.get("type")?.toUpperCase();
  const typeFilter = type === "DEPOSIT" || type === "WITHDRAW" ? type : null;

  // For a withdrawal the operator has to send money BY HAND, so the row must carry
  // everything needed to pay: which wallet (bKash / Nagad / Upay), the full number, and
  // whether that number is the one currently bound to the player's account.
  // LEFT JOINs, so an old request whose binding is gone still shows its stored number.
  const rows = await query(
    `SELECT cr.*, u.username_or_phone, u.phone,
            pa.account_number AS bound_number,
            pa.created_at     AS bound_at,
            (pa.account_number = cr.account_ref) AS number_is_bound
       FROM cashier_requests cr
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN payout_accounts pa
              ON pa.user_id = cr.user_id
             AND pa.channel = cr.channel
             AND pa.account_number = cr.account_ref
      WHERE cr.status = 'PENDING' ${typeFilter ? "AND cr.request_type = $1" : ""}
      ORDER BY cr.created_at ASC LIMIT 200`,
    typeFilter ? [typeFilter] : []
  );
  const counts = await query(
    `SELECT request_type, COUNT(*)::int AS n, COALESCE(SUM(amount_cents),0)::bigint AS total
     FROM cashier_requests WHERE status = 'PENDING' GROUP BY request_type`
  );
  return corsJson({
    ok: true,
    pending: rows.map(r => ({
      ...r,
      id: Number(r.id),
      amount_cents: Number(r.amount_cents),
      // true / false only for withdrawals; deposits pass null
      number_is_bound: r.bound_number ? Boolean(r.number_is_bound) : null,
    })),
    counts: counts.map(c => ({ ...c, total: String(c.total) })),
  });
}
