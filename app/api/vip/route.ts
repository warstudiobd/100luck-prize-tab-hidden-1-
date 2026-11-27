/**
 * VIP — level ladder + weekly chest, the 499bet "নিয়ম / VIP" screen.
 *
 *   GET  /api/vip
 *        unlocked        — lifetime deposits ≥ vip_unlock_deposit_cents (৳500)
 *        level           — the highest tier whose requirements the player meets
 *        tiers[]         — every tier with the player's 30-day progress
 *        weekly          — this week's chest: amount, claimable, claimed_at
 *        month           — 30-day deposit / wager totals (মাসিক জমা / মাসিক বাজি)
 *
 *   POST /api/vip   (no body)
 *        Claims this week's chest once. Requires: VIP unlocked AND the player's
 *        current level's requirements still met in the trailing 30 days.
 *
 * Everything is computed from real rows: cashier_requests (approved deposits)
 * and wallet_ledger (qualifying turnover). The level is NEVER stored — it is
 * derived on every read, so it cannot drift from the player's actual activity,
 * and demoting after 30 quiet days happens automatically.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";
import { readGateNumbers } from "@/lib/reward-gate";

export const dynamic = "force-dynamic";

/** Rolling 30-day window, evaluated on Asia/Dhaka days (today inclusive). */
const WINDOW_DAYS = 30;
const DAY_SQL = `(now() AT TIME ZONE 'Asia/Dhaka')::date`;
const WINDOW_START = `((${DAY_SQL}) - interval '${WINDOW_DAYS - 1} days')`;
/** Sunday that starts the current claim week (Asia/Dhaka). */
const WEEK_START = `(date_trunc('week', now() AT TIME ZONE 'Asia/Dhaka')::date)`;

type Tier = { level: number; min_deposit_cents: number; min_wager_cents: number; weekly_chest_cents: number; title_bn: string; title_en: string };

async function monthNumbers(userId: number) {
  const [row] = await query(
    `SELECT
       COALESCE((SELECT SUM(amount_cents) FROM cashier_requests
                  WHERE user_id = $1 AND request_type = 'DEPOSIT' AND status = 'APPROVED'
                    AND (created_at AT TIME ZONE 'Asia/Dhaka')::date >= ${WINDOW_START}), 0)::bigint AS dep,
       COALESCE((SELECT SUM(amount_cents) FROM wallet_ledger
                  WHERE user_id = $1 AND action_type = 'DEBIT'
                    AND provider_code NOT IN ('CASHIER','BONUS','')
                    AND (created_at AT TIME ZONE 'Asia/Dhaka')::date >= ${WINDOW_START}), 0)::bigint AS wag,
       ${WEEK_START}::text AS week_start`,
    [userId]
  ).catch(() => [{ dep: 0, wag: 0, week_start: null }]);
  return {
    depositCents: Number((row as any)?.dep ?? 0),
    wagerCents: Number((row as any)?.wag ?? 0),
    weekStart: String((row as any)?.week_start ?? ""),
  };
}

async function tiers(): Promise<Tier[]> {
  const rows = await query(
    "SELECT level, min_deposit_cents, min_wager_cents, weekly_chest_cents, title_bn, title_en FROM vip_tiers ORDER BY level"
  ).catch(() => [] as any[]);
  return (rows as any[]).map(r => ({
    level: Number(r.level),
    min_deposit_cents: Number(r.min_deposit_cents),
    min_wager_cents: Number(r.min_wager_cents),
    weekly_chest_cents: Number(r.weekly_chest_cents),
    title_bn: String(r.title_bn ?? ""),
    title_en: String(r.title_en ?? ""),
  }));
}

/** Highest tier whose BOTH requirements are met; 0 when none is. */
function levelFor(all: Tier[], dep: number, wag: number): number {
  let lv = 0;
  for (const t of all) if (dep >= t.min_deposit_cents && wag >= t.min_wager_cents) lv = t.level;
  return lv;
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const [all, month, life, claims] = await Promise.all([
    tiers(),
    monthNumbers(userId),
    readGateNumbers(userId),
    query(
      `SELECT week_start::text AS week_start, level, amount_cents, claimed_at
         FROM vip_chest_claims WHERE user_id = $1 ORDER BY week_start DESC LIMIT 12`,
      [userId]
    ).catch(() => [] as any[]),
  ]);

  // The ৳500 unlock is a lifetime-deposit threshold, separate from the tiers.
  const unlockCfg = await query("SELECT value FROM platform_settings WHERE key = 'vip_unlock_deposit_cents'").catch(() => [] as any[]);
  const unlockCents = Number((unlockCfg as any[])[0]?.value ?? 50_000);
  const unlocked = life.lifetimeDepositCents >= unlockCents;

  const level = levelFor(all, month.depositCents, month.wagerCents);
  const current = all.find(t => t.level === level) ?? null;
  const next = all.find(t => t.level === level + 1) ?? null;

  const thisWeek = (claims as any[]).find(c => String(c.week_start) === month.weekStart) ?? null;
  const chestCents = current?.weekly_chest_cents ?? 0;
  const canClaim = unlocked && level > 0 && !thisWeek;

  return NextResponse.json({
    ok: true,
    unlocked,
    unlock_cents: unlockCents,
    lifetime_deposit_cents: life.lifetimeDepositCents,
    level,
    title_bn: current?.title_bn ?? "",
    title_en: current?.title_en ?? "",
    month: {
      deposit_cents: month.depositCents,
      wager_cents: month.wagerCents,
      window_days: WINDOW_DAYS,
    },
    next: next
      ? {
          level: next.level,
          deposit_cents: next.min_deposit_cents,
          wager_cents: next.min_wager_cents,
          deposit_short_cents: Math.max(0, next.min_deposit_cents - month.depositCents),
          wager_short_cents: Math.max(0, next.min_wager_cents - month.wagerCents),
        }
      : null,
    tiers: all.map(t => ({
      ...t,
      reached: month.depositCents >= t.min_deposit_cents && month.wagerCents >= t.min_wager_cents,
      deposit_pct: t.min_deposit_cents > 0 ? Math.min(100, (month.depositCents / t.min_deposit_cents) * 100) : 100,
      wager_pct: t.min_wager_cents > 0 ? Math.min(100, (month.wagerCents / t.min_wager_cents) * 100) : 100,
    })),
    weekly: {
      week_start: month.weekStart || null,
      level,
      amount_cents: chestCents,
      can_claim: canClaim,
      claimed_at: thisWeek?.claimed_at ?? null,
      claimed_amount_cents: thisWeek ? Number(thisWeek.amount_cents) : 0,
      history: (claims as any[]).map(c => ({
        week_start: String(c.week_start),
        level: Number(c.level),
        amount_cents: Number(c.amount_cents),
        claimed_at: c.claimed_at,
      })),
    },
  });
}

export async function POST() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const [all, month, life] = await Promise.all([tiers(), monthNumbers(userId), readGateNumbers(userId)]);
  const unlockCfg = await query("SELECT value FROM platform_settings WHERE key = 'vip_unlock_deposit_cents'").catch(() => [] as any[]);
  const unlockCents = Number((unlockCfg as any[])[0]?.value ?? 50_000);

  if (life.lifetimeDepositCents < unlockCents) {
    return NextResponse.json(
      {
        ok: false, code: "vip_locked",
        error: `Deposit ৳${(unlockCents / 100).toLocaleString("en-IN")} in total to unlock VIP rewards`,
        error_bn: `মোট ৳${(unlockCents / 100).toLocaleString("en-IN")} ডিপোজিট করলেই VIP পুরস্কার চালু হবে`,
      },
      { status: 403 }
    );
  }

  const level = levelFor(all, month.depositCents, month.wagerCents);
  const current = all.find(t => t.level === level) ?? null;
  if (!current || current.weekly_chest_cents <= 0) {
    return NextResponse.json(
      {
        ok: false, code: "no_tier",
        error: "Reach VIP 1 first — deposit and wager totals over the last 30 days decide your level",
        error_bn: "আগে VIP ১-এ উন্নীত হোন — গত ৩০ দিনের জমা ও বাজির ভিত্তিতে লেভেল নির্ধারিত হয়",
      },
      { status: 403 }
    );
  }

  try {
    const result = await withTransaction(async (client) => {
      // UNIQUE (user_id, week_start) is the lock: a double tap pays once.
      const ins = await client.query(
        `INSERT INTO vip_chest_claims (user_id, week_start, level, amount_cents)
         VALUES ($1, ${WEEK_START}, $2, $3)
         ON CONFLICT (user_id, week_start) DO NOTHING
         RETURNING id`,
        [userId, current.level, current.weekly_chest_cents]
      );
      if (ins.rowCount === 0) return { already: true };

      await creditBonusInTx(client, {
        userId,
        deltaCents: current.weekly_chest_cents,
        subtype: "vip_chest",
        callId: `bns_vip_${userId}_${month.weekStart}`,
      });
      const bal = await client.query("SELECT balance_cents FROM users WHERE id = $1", [userId]);
      return { already: false, balance_cents: Number((bal.rows[0] as any)?.balance_cents ?? 0) };
    });

    if (result.already) {
      return NextResponse.json({ ok: true, claimed: false, paid_cents: 0, reason: "already_claimed" });
    }
    return NextResponse.json({
      ok: true, claimed: true, level: current.level,
      paid_cents: current.weekly_chest_cents,
      balance_cents: (result as any).balance_cents,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "vip_claim_failed" }, { status: 500 });
  }
}
