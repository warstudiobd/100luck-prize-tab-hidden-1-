/**
 * Player cashier totals — the three numbers under the deposit form:
 *   deposited — lifelong approved DEPOSIT amounts (real money in)
 *   withdrawal — lifelong approved WITHDRAW amounts (real money out)
 *   bonus     — lifetime BONUS credits won (lucky spin, referral, …)
 *
 * Every figure is summed from the cashier / ledger tables, so a member never
 * sees an optimistic placeholder. Fails soft to zeros plus `ok:false` so the
 * screen can fall back to the plain wording instead of showing a wrong number.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { BONUS_CREDIT_SQL } from "@/lib/bonus";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const [dep, wdr, bon, bal, turn] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
           FROM cashier_requests
          WHERE user_id = $1 AND request_type = 'DEPOSIT' AND status = 'APPROVED'`,
        [sess.sub]
      ).catch(() => [{ s: 0 }]),
      query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
           FROM cashier_requests
          WHERE user_id = $1 AND request_type = 'WITHDRAW' AND status = 'APPROVED'`,
        [sess.sub]
      ).catch(() => [{ s: 0 }]),
      query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s,
                COUNT(*)::int AS n
           FROM wallet_ledger
          WHERE user_id = $1 AND ${BONUS_CREDIT_SQL}`,
        [sess.sub]
      ).catch(() => [{ s: 0 }]),
      query(`SELECT COALESCE(balance_cents, 0)::bigint AS s FROM users WHERE id = $1`, [sess.sub]).catch(() => [{ s: 0 }]),
      // Lifetime qualifying turnover — the same basis the member centre uses for VIP progress
      query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
           FROM wallet_ledger
          WHERE user_id = $1 AND action_type = 'DEBIT'
            AND provider_code NOT IN ('CASHIER','BONUS','')`,
        [sess.sub]
      ).catch(() => [{ s: 0 }]),
    ]);

    return NextResponse.json({
      ok: true,
      deposited_cents: Number(dep[0]?.s ?? 0),
      withdrawal_cents: Number(wdr[0]?.s ?? 0),
      bonus_cents: Number(bon[0]?.s ?? 0),
      bonus_count: Number((bon[0] as any)?.n ?? 0),
      balance_cents: Number(bal[0]?.s ?? 0),
      turnover_cents: Number((turn as any[])[0]?.s ?? 0),
    });
  } catch {
    return NextResponse.json({ ok: false, deposited_cents: 0, withdrawal_cents: 0, bonus_cents: 0 });
  }
}
