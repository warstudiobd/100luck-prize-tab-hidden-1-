/** Admin — bonus engine stats: referral payouts + daily lucky spins. Read-only. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { SPIN_DAY_SQL } from "@/lib/bonus";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const [refAgg, refRecent, spinAgg, spinToday, spinRecent] = await Promise.all([
    query(`SELECT count(*)::int AS count, COALESCE(sum(amount_cents),0)::bigint AS total_cents FROM bonus_referrals`),
    query(`SELECT r.id, r.amount_cents, r.deposit_request_id, r.created_at,
                  ru.username_or_phone AS referrer, uu.username_or_phone AS referred
           FROM bonus_referrals r
           JOIN users ru ON ru.id = r.referrer_id
           JOIN users uu ON uu.id = r.referred_id
           ORDER BY r.created_at DESC LIMIT 20`),
    query(`SELECT count(*)::int AS count, COALESCE(sum(prize_cents),0)::bigint AS total_cents FROM lucky_spins`),
    query(`SELECT count(*)::int AS count FROM lucky_spins WHERE spin_day = ${SPIN_DAY_SQL}`),
    query(`SELECT s.id, s.prize_key, s.prize_cents, s.spin_day, s.created_at, u.username_or_phone AS user
           FROM lucky_spins s JOIN users u ON u.id = s.user_id
           ORDER BY s.created_at DESC LIMIT 20`),
  ]);

  return corsJson({
    ok: true,
    referrals: {
      count: refAgg[0]?.count ?? 0,
      total_cents: Number(refAgg[0]?.total_cents ?? 0),
      recent: refRecent.map(r => ({ ...r, id: Number(r.id), amount_cents: Number(r.amount_cents), deposit_request_id: r.deposit_request_id == null ? null : Number(r.deposit_request_id) })),
    },
    spins: {
      count: spinAgg[0]?.count ?? 0,
      total_cents: Number(spinAgg[0]?.total_cents ?? 0),
      today_count: spinToday[0]?.count ?? 0,
      recent: spinRecent.map(s => ({ ...s, id: Number(s.id), prize_cents: Number(s.prize_cents), spin_day: String(s.spin_day).slice(0, 10) })),
    },
  });
}
