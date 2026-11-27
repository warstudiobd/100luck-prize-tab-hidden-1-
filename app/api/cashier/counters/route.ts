/**
 * Player cashier counters + the daily withdrawal cap, all from real rows.
 *
 *   pending_deposits / pending_withdrawals — requests awaiting admin review
 *   today_withdrawals                      — APPROVED withdrawals since midnight
 *                                            (Asia/Dhaka), used for the daily cap
 *   daily_limit                            — platform setting `withdraw_daily_limit`
 *                                            (count of approved withdrawals per day,
 *                                            default 99999 = effectively unlimited)
 *
 * Nothing is invented: an absent table or failed read reports zeros, and the
 * client renders "—" rather than a number it cannot back up.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const DAY_SQL = `(created_at AT TIME ZONE 'Asia/Dhaka')::date = (now() AT TIME ZONE 'Asia/Dhaka')::date`;

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [counts, today, limitRaw] = await Promise.all([
    query(
      `SELECT request_type, COUNT(*)::int AS n
         FROM cashier_requests
        WHERE user_id = $1 AND status = 'PENDING'
        GROUP BY request_type`,
      [sess.sub]
    ).catch(() => [] as any[]),
    query(
      `SELECT COUNT(*)::int AS n
         FROM cashier_requests
        WHERE user_id = $1 AND request_type = 'WITHDRAW' AND status = 'APPROVED' AND ${DAY_SQL}`,
      [sess.sub]
    ).catch(() => [{ n: 0 }]),
    getSetting("withdraw_daily_limit", "99999").catch(() => "99999"),
  ]);

  const byType = Object.fromEntries((counts as any[]).map(r => [String(r.request_type), Number(r.n)]));
  const dailyLimit = Math.max(0, Math.trunc(Number(limitRaw)) || 99999);

  return NextResponse.json({
    ok: true,
    pending_deposits: byType.DEPOSIT ?? 0,
    pending_withdrawals: byType.WITHDRAW ?? 0,
    today_withdrawals: Number((today as any)[0]?.n ?? 0),
    daily_limit: dailyLimit,
  });
}
