/**
 * রিবেট — bet rebate, the 499bet "রিবেট" screen.
 *
 *   GET  /api/rebate?date=YYYY-MM-DD
 *        today      — the per-category breakdown for the selected Dhaka day
 *        history    — last 30 days that have any turnover or any claim
 *        rate_bps   — rebate rate from platform_settings
 *        can_claim  — today's rebate exists and has not been claimed yet
 *
 *   POST /api/rebate   { date?: 'YYYY-MM-DD' }
 *        Pays the day's rebate as real BONUS balance, once, via creditBonusInTx.
 *        Idempotent: a second call returns claimed:false, paid_cents:0.
 *
 * Every number comes from wallet_ledger DEBIT rows joined to games_catalog for
 * the category. A category the player never touched pays 0.00 — that is a real
 * zero, not a placeholder. Settlement windows are Asia/Dhaka days.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";
import { assertHasDeposited } from "@/lib/reward-gate";

export const dynamic = "force-dynamic";

const DHAKA_TODAY = `(now() AT TIME ZONE 'Asia/Dhaka')::date`;
const DEFAULT_RATE_BPS = 5; // 0.05 % of turnover

/** Map the catalogue's category onto the six lines the reference screen shows. */
function bucket(category: string | null): "slots" | "live" | "table" | "crash" | "poker" | "other" {
  switch (String(category ?? "").toUpperCase()) {
    case "SLOTS": return "slots";
    case "LIVE": return "live";
    case "TABLE": return "table";
    case "CRASH": return "crash";
    case "POKER": return "poker";
    default: return "other";
  }
}

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type Day = {
  day: string;
  slots_cents: number; live_cents: number; table_cents: number;
  crash_cents: number; poker_cents: number; other_cents: number;
  total_cents: number; claimed_at: string | null;
};

async function buildDay(userId: number, day: string, rateBps: number): Promise<Day> {
  // Turnover for the day, bucketed by catalogue category.
  const rows = await query(
    `SELECT gc.category, COALESCE(SUM(wl.amount_cents), 0)::bigint AS cents
       FROM wallet_ledger wl
       LEFT JOIN games_catalog gc
              ON gc.game_code = wl.game_code AND gc.provider_code = wl.provider_code
      WHERE wl.user_id = $1
        AND wl.action_type = 'DEBIT'
        AND wl.provider_code NOT IN ('CASHIER', 'BONUS', '')
        AND (wl.created_at AT TIME ZONE 'Asia/Dhaka')::date = $2::date
      GROUP BY gc.category`,
    [userId, day]
  ).catch(() => [] as any[]);

  const turn: Record<string, number> = { slots: 0, live: 0, table: 0, crash: 0, poker: 0, other: 0 };
  for (const r of rows as any[]) turn[bucket(r.category)] += Number(r.cents);

  // Turnover × rate, floored per bucket so the six lines always add up to the total.
  const calc = (cents: number) => Math.floor((cents * rateBps) / 10000);
  const slots = calc(turn.slots), live = calc(turn.live), table = calc(turn.table);
  const crash = calc(turn.crash), poker = calc(turn.poker), other = calc(turn.other);

  const claim = await query(
    "SELECT claimed_at FROM rebate_days WHERE user_id = $1 AND rebate_day = $2::date",
    [userId, day]
  ).catch(() => [] as any[]);

  return {
    day,
    slots_cents: slots, live_cents: live, table_cents: table,
    crash_cents: crash, poker_cents: poker, other_cents: other,
    total_cents: slots + live + table + crash + poker + other,
    claimed_at: (claim as any[])[0]?.claimed_at ?? null,
  };
}

async function rate(): Promise<number> {
  const r = await query("SELECT value FROM platform_settings WHERE key = 'rebate_rate_bps'").catch(() => [] as any[]);
  const n = Number((r as any[])[0]?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RATE_BPS;
}

export async function GET(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const rateBps = await rate();
  const asked = req.nextUrl.searchParams.get("date");
  const todayRow = await query(`SELECT ${DHAKA_TODAY}::text AS d`).catch(() => [{ d: new Date().toISOString().slice(0, 10) }]);
  const today = String((todayRow as any[])[0]?.d ?? new Date().toISOString().slice(0, 10));
  const day = isDate(asked) ? asked : today;

  const todayBlock = await buildDay(userId, day, rateBps);

  // History: one row per Dhaka day that has turnover or a stored claim.
  const hist = await query(
    `WITH days AS (
       SELECT (created_at AT TIME ZONE 'Asia/Dhaka')::date AS d
         FROM wallet_ledger
        WHERE user_id = $1 AND action_type = 'DEBIT'
          AND provider_code NOT IN ('CASHIER','BONUS','')
       UNION
       SELECT rebate_day FROM rebate_days WHERE user_id = $1
     )
     SELECT d::text AS day,
            COALESCE((SELECT SUM(wl.amount_cents) FROM wallet_ledger wl
                       WHERE wl.user_id = $1 AND wl.action_type = 'DEBIT'
                         AND wl.provider_code NOT IN ('CASHIER','BONUS','')
                         AND (wl.created_at AT TIME ZONE 'Asia/Dhaka')::date = days.d), 0)::bigint AS turnover_cents,
            rd.total_cents, rd.claimed_at
       FROM days LEFT JOIN rebate_days rd ON rd.user_id = $1 AND rd.rebate_day = days.d
      ORDER BY d DESC LIMIT 30`,
    [userId]
  ).catch(() => [] as any[]);

  return NextResponse.json({
    ok: true,
    rate_bps: rateBps,
    today,
    day,
    latest: todayBlock,
    can_claim: day === today && todayBlock.total_cents > 0 && !todayBlock.claimed_at,
    history: (hist as any[]).map(r => ({
      day: String(r.day),
      turnover_cents: Number(r.turnover_cents ?? 0),
      rebate_cents: Number(r.total_cents ?? Math.floor((Number(r.turnover_cents ?? 0) * rateBps) / 10000)),
      claimed_at: r.claimed_at ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  let body: any = {};
  try { body = await req.json(); } catch {}

  // No deposit, no bonus — enforced on the payout, not on the screen, so the
  // player can still see what they have earned.
  const gate = await assertHasDeposited(userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, code: gate.code, error: gate.error, error_bn: gate.error_bn, gate: gate.gate }, { status: 403 });
  }

  const rateBps = await rate();
  const todayRow = await query(`SELECT ${DHAKA_TODAY}::text AS d`).catch(() => [{ d: new Date().toISOString().slice(0, 10) }]);
  const today = String((todayRow as any[])[0]?.d ?? new Date().toISOString().slice(0, 10));
  const day = isDate(body?.date) ? body.date : today;

  // Rebates settle per Dhaka day; yesterday's window cannot be reopened.
  if (day !== today) {
    return NextResponse.json({ ok: false, error: "settled_window" }, { status: 400 });
  }

  const block = await buildDay(userId, day, rateBps);
  if (block.total_cents <= 0) {
    return NextResponse.json({ ok: true, claimed: false, paid_cents: 0, reason: "nothing_to_claim" });
  }
  if (block.claimed_at) {
    return NextResponse.json({ ok: true, claimed: false, paid_cents: 0, reason: "already_claimed", claimed_at: block.claimed_at });
  }

  try {
    const result = await withTransaction(async (client) => {
      // Insert first: the UNIQUE (user_id, rebate_day) is the lock that makes a
      // double-tap impossible, even from two devices at once.
      const ins = await client.query(
        `INSERT INTO rebate_days (user_id, rebate_day, slots_cents, live_cents, table_cents,
                                  crash_cents, poker_cents, other_cents, total_cents)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, rebate_day) DO NOTHING
         RETURNING id`,
        [userId, day, block.slots_cents, block.live_cents, block.table_cents,
         block.crash_cents, block.poker_cents, block.other_cents, block.total_cents]
      );
      if (ins.rowCount === 0) return { already: true };

      await creditBonusInTx(client, {
        userId,
        deltaCents: block.total_cents,
        subtype: "rebate",
        callId: `bns_rebate_${userId}_${day}`,
      });

      await client.query(
        "UPDATE rebate_days SET claimed_at = now() WHERE user_id = $1 AND rebate_day = $2::date",
        [userId, day]
      );

      const bal = await client.query("SELECT balance_cents FROM users WHERE id = $1", [userId]);
      return { already: false, balance_cents: Number((bal.rows[0] as any)?.balance_cents ?? 0) };
    });

    if (result.already) {
      return NextResponse.json({ ok: true, claimed: false, paid_cents: 0, reason: "already_claimed" });
    }
    return NextResponse.json({
      ok: true, claimed: true, paid_cents: block.total_cents,
      balance_cents: (result as any).balance_cents,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "rebate_failed" }, { status: 500 });
  }
}
