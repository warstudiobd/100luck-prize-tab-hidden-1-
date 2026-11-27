/**
 * Member-center badges — the little red counters on the icon grid.
 *
 * Every number here is derived from real data, never faked:
 *   rewards:  1 when today's FREE login prize is still unclaimed
 *   missions: missions whose turnover target is reached but not yet claimed
 *   spin:     always 0 — since v36 a spin is a ৳2.99 paid play, never an
 *             "unclaimed free" prize, so a red dot would be a lie
 *   rebate:   today's rebate is worth more than zero and is still unclaimed
 *
 * All are capped at 9 server-side; the client renders "9+".
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { BONUS_CREDIT_SQL } from "@/lib/bonus";

export const dynamic = "force-dynamic";

const CAP = 9;
const DHAKA_TODAY = `(now() AT TIME ZONE 'Asia/Dhaka')::date`;

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: true, spin: 0, rewards: 0, missions: 0, rebate: 0 });
  const userId = Number(sess.sub);

  // v36: paid play — nothing is "waiting" for the player, so no badge.
  const spin = 0;

  // Reward centre: an unclaimed prize per day, per kind. Two kinds → max 2.
  let rewards = 0;
  try {
    const r = await query(
      `SELECT tx_subtype, count(*)::int AS n FROM wallet_ledger
        WHERE user_id = $1 AND ${BONUS_CREDIT_SQL}
          AND tx_subtype IN ('daily_login', 'egg_smash')
          AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_TODAY}
        GROUP BY tx_subtype`,
      [userId]
    );
    const claimed = new Set((r as any[]).map(x => String(x.tx_subtype)));
    // v36: eggs are paid plays (no "unclaimed" state); only the free login counts.
    rewards = claimed.has("daily_login") ? 0 : 1;
  } catch {
    rewards = 0;
  }

  // Missions: target reached today but the bonus is still unclaimed.
  let missions = 0;
  try {
    const r = await query(
      `WITH turn AS (
         SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents
           FROM wallet_ledger
          WHERE user_id = $1 AND action_type = 'DEBIT'
            AND provider_code NOT IN ('CASHIER','BONUS','')
            AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_TODAY}
       )
       SELECT count(*)::int AS n FROM missions m, turn
        WHERE m.is_active
          AND turn.cents >= m.target_cents
          AND NOT EXISTS (SELECT 1 FROM mission_claims mc
                           WHERE mc.user_id = $1 AND mc.mission_id = m.id)`,
      [userId]
    );
    missions = Math.min(CAP, Number((r as any[])[0]?.n ?? 0));
  } catch {
    missions = 0;
  }

  // Rebate: today's rebate exists and has not been claimed.
  let rebate = 0;
  try {
    const r = await query(
      `SELECT
         COALESCE((SELECT SUM(amount_cents) FROM wallet_ledger
                    WHERE user_id = $1 AND action_type = 'DEBIT'
                      AND provider_code NOT IN ('CASHIER','BONUS','')
                      AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_TODAY}), 0)::bigint AS turnover,
         (SELECT 1 FROM rebate_days
           WHERE user_id = $1 AND rebate_day = ${DHAKA_TODAY} AND claimed_at IS NOT NULL) AS claimed`,
      [userId]
    );
    const row: any = (r as any[])[0] ?? {};
    rebate = Number(row.turnover ?? 0) > 0 && !row.claimed ? 1 : 0;
  } catch {
    rebate = 0;
  }

  return NextResponse.json({ ok: true, spin, rewards, missions, rebate });
}
