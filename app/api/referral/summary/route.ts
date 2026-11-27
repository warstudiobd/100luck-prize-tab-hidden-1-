/**
 * বন্ধুদের আমিন্ত্রণ জানান — every number the invitation screen shows, in one call.
 *
 *   income   — আজ / গতকাল / মোট, broken down by bonus kind, plus referrals and
 *              "qualification progress". Only kinds that can produce a real number
 *              are listed; a kind the platform does not pay stays at ৳0.
 *   goals    — the platform's income target and the referral goal
 *   ladder   — tier → bonus, each marked paid / reached / locked
 *   records  — one row per paid referral bonus (নিবন্ধনের তারিখ · নাম · পরিমাণ)
 *   recent   — friends who registered with this player's code, masked
 *
 * Bonus credits are written with action_type='BONUS' (see BONUS_CREDIT_SQL), which
 * is why every sum here uses that predicate instead of action_type='CREDIT'.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { BONUS_CREDIT_SQL } from "@/lib/bonus";

export const dynamic = "force-dynamic";

const DHAKA_DATE = `(now() AT TIME ZONE 'Asia/Dhaka')::date`;

/** 19******6 — the masking style used throughout the reference screens. */
function mask(v: string | null): string {
  const s = String(v ?? "");
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}${"*".repeat(Math.max(3, s.length - 4))}${s.slice(-2)}`;
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const [me, referred, paid, byKind, todayKind, goals, ladder, claims] = await Promise.all([
    query("SELECT vip_level, referral_code FROM users WHERE id = $1", [userId]).catch(() => [] as any[]),

    query(
      `SELECT id, username_or_phone, created_at FROM users
        WHERE referred_by = $1 AND id <> $1 ORDER BY created_at DESC LIMIT 200`,
      [userId]
    ).catch(() => [] as any[]),

    query(
      `SELECT br.id, br.referred_id, br.amount_cents, br.created_at, u.username_or_phone
         FROM bonus_referrals br LEFT JOIN users u ON u.id = br.referred_id
        WHERE br.referrer_id = $1 ORDER BY br.created_at DESC LIMIT 200`,
      [userId]
    ).catch(() => [] as any[]),

    query(
      `SELECT tx_subtype, COALESCE(SUM(amount_cents), 0)::bigint AS s, COUNT(*)::int AS n
         FROM wallet_ledger
        WHERE user_id = $1 AND ${BONUS_CREDIT_SQL}
        GROUP BY tx_subtype`,
      [userId]
    ).catch(() => [] as any[]),

    query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s, COUNT(*)::int AS n
         FROM wallet_ledger
        WHERE user_id = $1 AND ${BONUS_CREDIT_SQL}
          AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_DATE}`,
      [userId]
    ).catch(() => [{ s: 0, n: 0 }]),

    query("SELECT key, value FROM platform_settings WHERE key IN ('invite_income_goal_cents','invite_referrals_goal')")
      .catch(() => [] as any[]),

    query("SELECT referrals, bonus_cents FROM invite_ladder ORDER BY referrals ASC").catch(() => [] as any[]),
    query("SELECT referrals, bonus_cents, created_at FROM invite_ladder_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", [userId]).catch(() => [] as any[]),
  ]);

  // Wagers are what the turnover/qualification bar is measured on.
  const [wager] = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
       FROM wallet_ledger
      WHERE user_id = $1 AND action_type = 'DEBIT' AND provider_code NOT IN ('CASHIER','BONUS','')`,
    [userId]
  ).catch(() => [{ s: 0 }]);

  const kinds = Object.fromEntries((byKind as any[]).map(r => [String(r.tx_subtype), Number(r.s)]));
  const kindCounts = Object.fromEntries((byKind as any[]).map(r => [String(r.tx_subtype), Number(r.n)]));
  const setting = Object.fromEntries((goals as any[]).map(r => [String(r.key), String(r.value)]));
  const rows = referred as any[];
  const paidRows = paid as any[];
  const paidTiers = new Set((claims as any[]).map(r => Number(r.referrals)));

  // The রেকর্ডস tab shows every bonus this player actually received for inviting:
  // per-friend payouts (bonus_referrals) AND tier rewards (invite_ladder_claims).
  const ladderRecords = (claims as any[]).map(r => ({
    id: `tier_${Number(r.referrals)}`,
    who: `${Number(r.referrals)} ${"tier"}`,
    referred_id: null,
    amount_cents: Number(r.bonus_cents),
    created_at: r.created_at,
    source: "ladder" as const,
  }));

  const totalIncome = (byKind as any[]).reduce((s, r) => s + Number(r.s), 0);
  const referralIncome = kinds.referral_bonus ?? 0;
  const todayIncome = Number((todayKind as any)[0]?.s ?? 0);

  // "আজকের আয়" was captured above; yesterday needs its own read for the four cards.
  const [yesterday] = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s FROM wallet_ledger
      WHERE user_id = $1 AND ${BONUS_CREDIT_SQL}
        AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_DATE} - 1`,
    [userId]
  ).catch(() => [{ s: 0 }]);

  const rangeCounts = await query(
    `SELECT
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_DATE})::int     AS today,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_DATE} - 1)::int AS yesterday,
        COUNT(*) FILTER (WHERE date_trunc('month', created_at AT TIME ZONE 'Asia/Dhaka')
                           = date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka'))::int              AS month
      FROM users WHERE referred_by = $1 AND id <> $1`,
    [userId]
  ).catch(() => [{ today: 0, yesterday: 0, month: 0 }]);

  const vip = Number((me as any)[0]?.vip_level ?? 0);

  return NextResponse.json({
    ok: true,
    level: vip > 0 ? `VIP${vip}` : "Default",
    vip_level: vip,
    referral_code: (me as any)[0]?.referral_code ?? "",
    counts: { referrals: rows.length, qualified: paidRows.length },
    by_range: {
      today: Number((rangeCounts as any)[0]?.today ?? 0),
      yesterday: Number((rangeCounts as any)[0]?.yesterday ?? 0),
      month: Number((rangeCounts as any)[0]?.month ?? 0),
    },
    income: {
      today_cents: todayIncome,
      yesterday_cents: Number((yesterday as any).s ?? 0),
      total_cents: totalIncome,
      referral_cents: referralIncome,
      referral_count: kindCounts.referral_bonus ?? 0,
      // Other bonus kinds the ledger actually carries — shown honestly, at ৳0 when unused.
      kinds: [
        { key: "referral_bonus", labelBn: "আমন্ত্রণ পুরস্কার", labelEn: "Invite bonus", cents: referralIncome, count: kindCounts.referral_bonus ?? 0 },
        { key: "daily_login", labelBn: "সাফল্য পুরস্কার", labelEn: "Daily login", cents: kinds.daily_login ?? 0, count: kindCounts.daily_login ?? 0 },
        { key: "lucky_spin", labelBn: "ভাগ্য চাকা", labelEn: "Lucky spin", cents: kinds.lucky_spin ?? 0, count: kindCounts.lucky_spin ?? 0 },
        { key: "egg_smash", labelBn: "ডিম পুরস্কার", labelEn: "Egg smash", cents: kinds.egg_smash ?? 0, count: kindCounts.egg_smash ?? 0 },
      ],
      wagered_cents: Number((wager as any)?.s ?? 0),
      deposit_cents: 0, // no deposit bonus exists on this platform — kept explicit
    },
    goals: {
      income_cents: Number(setting.invite_income_goal_cents ?? 30_000_000),
      referrals: Number(setting.invite_referrals_goal ?? 1000),
    },
    ladder: (ladder as any[]).map(r => ({
      referrals: Number(r.referrals),
      bonus_cents: Number(r.bonus_cents),
      reached: rows.length >= Number(r.referrals),
      paid: paidTiers.has(Number(r.referrals)),
    })),
    recent: rows.slice(0, 20).map(r => ({ id: Number(r.id), who: mask(r.username_or_phone), joined_at: r.created_at })),
    records: [
      ...paidRows.map(r => ({
        id: `friend_${Number(r.id)}`,
        who: mask(r.username_or_phone),
        referred_id: Number(r.referred_id),
        amount_cents: Number(r.amount_cents),
        created_at: r.created_at,
        source: "friend" as const,
      })),
      ...ladderRecords,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    rules: { bonus_cents: 30_000, effective_from: "2026-11-23T00:00:00+06:00" },
  });
}
