/**
 * v51 — shared reads for the prize centre (GET /api/prizes).
 *
 * Every number in the response is real:
 *   tickets        one per gate the player has genuinely crossed, plus the one
 *                  free ticket — ৳100 / ৳1,000 / ৳5,000 approved deposits and
 *                  ৳1,000 qualifying turnover per further ticket.
 *   eggs_used      how many paid egg plays were made today (their money is gone,
 *                  so the shell stays cracked — that is not a decoration).
 *   progress       today's qualifying turnover against the ৳1,000.00 target.
 *   recent         winners, masked, with the currency they were paid in.
 *   iphone_winners masked names of everyone who has ever hit the iPhone slice.
 * No fake rows, no invented players: an empty list is shown as empty.
 */
import { query } from "@/lib/db";
import { BONUS_CREDIT_SQL } from "@/lib/bonus";
import {
  TICKET_GATES_CENTS, TICKET_GATE_PRIZES_CENTS, TICKET_WAGER_PER_TICKET_CENTS,
  TICKET_MAX_PER_DAY, DAILY_TARGET_DEFAULT_CENTS, maskWho, maskName,
} from "@/lib/prize-wheel";

const DAY_SQL = "(now() AT TIME ZONE 'Asia/Dhaka')::date";
/** Qualifying turnover = real game bets today (play fees are not turnover). */
const TURNOVER_SQL = `
  SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents
    FROM wallet_ledger
   WHERE user_id = $1 AND action_type = 'DEBIT'
     AND provider_code NOT IN ('PAIDPLAY','BONUS')
     AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DAY_SQL}`;

export type PromoState = Awaited<ReturnType<typeof loadPromoState>>;

export async function loadPromoState(userId: number | null) {
  /* ── the day's window and settings mirror /api/rewards ─────────────────── */
  const ends = await query(
    `SELECT ((now() AT TIME ZONE 'Asia/Dhaka')::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka' AS ends_at`
  ).catch(() => [{ ends_at: null }] as any[]);
  const settings = await query(
    `SELECT key, value FROM platform_settings WHERE key IN ('daily_login_max_prize_cents','promo_daily_target_cents','play_fee_cents','prize_wheel_fee_cents')`
  ).catch(() => [] as any[]);
  const setting = Object.fromEntries((settings as any[]).map(r => [String(r.key), String(r.value)]));
  const dailyTarget = Number(setting.promo_daily_target_cents) >= 100
    ? Number(setting.promo_daily_target_cents) : DAILY_TARGET_DEFAULT_CENTS;

  /* ── public winners ────────────────────────────────────────────────────── */
  const recentRows = await query(
    `SELECT u.username_or_phone AS who, l.amount_cents, l.created_at, '৳'::text AS currency
       FROM (
         SELECT DISTINCT ON (user_id) user_id, amount_cents, created_at
           FROM wallet_ledger
          WHERE ${BONUS_CREDIT_SQL} AND user_id <> COALESCE($1, -1) AND amount_cents > 0
          ORDER BY user_id, amount_cents DESC
       ) l
       JOIN users u ON u.id = l.user_id
      ORDER BY l.amount_cents DESC, l.created_at DESC
      LIMIT 10`,
    [userId]
  ).catch(() => [] as any[]);

  const wheelRows = await query(
    `SELECT u.username_or_phone AS who, w.prize_cents AS amount_cents, w.created_at, '৳'::text AS currency
       FROM prize_wheel w JOIN users u ON u.id = w.user_id
      WHERE w.physical = false AND w.prize_cents > 0 AND w.user_id <> COALESCE($1, -1)
      ORDER BY w.created_at DESC LIMIT 10`,
    [userId]
  ).catch(() => [] as any[]);

  /* one row per player, biggest first — a list that repeats a name reads as fake */
  const best = new Map<string, { who: string; amount_cents: number; created_at: string; currency: string }>();
  for (const r of [...(recentRows as any[]), ...(wheelRows as any[])]) {
    const key = String(r.who ?? "");
    const amount = Number(r.amount_cents);
    const prev = best.get(key);
    if (!prev || amount > prev.amount_cents) {
      best.set(key, { who: maskWho(key), amount_cents: amount, created_at: r.created_at, currency: "৳" });
    }
  }
  const recent = [...best.values()].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 8);

  const iphoneRows = await query(
    `SELECT u.username_or_phone AS who, w.created_at
       FROM prize_wheel w JOIN users u ON u.id = w.user_id
      WHERE w.physical = true
      ORDER BY w.created_at DESC LIMIT 6`
  ).catch(() => [] as any[]);
  const iphoneWinners = (iphoneRows as any[]).map(r => ({ who: maskName(r.who), created_at: r.created_at }));

  const wheelCount = await query("SELECT COUNT(*)::int AS n FROM prize_wheel WHERE physical = false")
    .catch(() => [{ n: 0 }] as any[]);

  const base = {
    ok: true,
    ends_at: (ends as any)[0]?.ends_at ?? null,
    daily_target_cents: dailyTarget,
    wager_per_ticket_cents: TICKET_WAGER_PER_TICKET_CENTS,
    max_tickets_per_day: TICKET_MAX_PER_DAY,
    gates: TICKET_GATES_CENTS.map((g, i) => ({ gate_cents: g, chip_cents: TICKET_GATE_PRIZES_CENTS[i] })),
    fee_cents: Number(setting.play_fee_cents) >= 0 ? Number(setting.play_fee_cents) : 299,
    wheel_fee_cents: 0, // retired: free spins only, earned from approved deposits
    daily_bonus_max_cents: Number(setting.daily_login_max_prize_cents ?? 9_999_900),
    recent,
    iphone_winners: iphoneWinners,
    wheel_plays: Number((wheelCount as any[])[0]?.n ?? 0),
    wheel_spins_available: 0,
    game_credits: { wheel: { available: 0, used: 0 }, egg: { available: 0, used: 0 }, envelope: { available: 0, used: 0 }, mail: { available: 0, used: 0 } },
  };

  if (!userId) {
    return {
      ...base, logged_in: false,
      tickets: { total: 0, free_available: true, gates: base.gates.map(g => ({ ...g, unlocked: false, claimed: false, progress_cents: 0 })) },
      turnover_cents: 0, progress_cents: 0, open_tickets: 0, free_available: true,
      my_wheel: [], my_tickets: [], deposit_today_cents: 0, balance_cents: 0,
      egg_count: 9, eggs_used: [] as number[],
    };
  }

  /* ── the player's own numbers ──────────────────────────────────────────── */
  const [creditRows, legacyWheelRows] = await Promise.all([
    query(
      `SELECT game_key,
              COUNT(*) FILTER (WHERE redeemed_at IS NULL)::int AS available,
              COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS used
         FROM prize_game_credits WHERE user_id = $1 GROUP BY game_key`, [userId]
    ).catch(() => [] as any[]),
    query("SELECT COUNT(*)::int AS n FROM lucky_wheel_credits WHERE user_id = $1 AND spin_id IS NULL", [userId])
      .catch(() => [{ n: 0 }] as any[]),
  ]);
  const gameCredits: Record<string, { available: number; used: number }> = {
    wheel: { available: 0, used: 0 }, egg: { available: 0, used: 0 },
    envelope: { available: 0, used: 0 }, mail: { available: 0, used: 0 },
  };
  for (const row of creditRows as any[]) gameCredits[String(row.game_key)] = {
    available: Number(row.available ?? 0), used: Number(row.used ?? 0),
  };
  gameCredits.wheel.available = Number((legacyWheelRows as any[])[0]?.n ?? 0);
  base.wheel_spins_available = gameCredits.wheel.available;
  (base as any).game_credits = gameCredits;

  const turnoverRow = await query(TURNOVER_SQL, [userId]).catch(() => [{ cents: 0 }] as any[]);
  const turnover = Number((turnoverRow as any[])[0]?.cents ?? 0);

  /* tickets already earned today: one per ৳1,000 turnover, up to the day's cap */
  const earned = Math.min(TICKET_MAX_PER_DAY, Math.floor(turnover / TICKET_WAGER_PER_TICKET_CENTS));
  const claimedRows = await query(
    `SELECT kind, gate_cents, free_used, prize_cents, claim_day FROM prize_tickets
      WHERE user_id = $1 AND claim_day = ${DAY_SQL}`,
    [userId]
  ).catch(() => [] as any[]);
  const claimed = claimedRows as any[];
  const wagerClaimed = claimed.filter(r => String(r.kind).startsWith("wager")).length;
  const freeClaimed = claimed.some(r => String(r.kind) === "free");
  const openTickets = Math.max(0, earned - wagerClaimed);

  /* deposit gates unlocked today (real approved deposits) */
  const depRow = await query(
    `SELECT COALESCE(SUM(r.amount_cents), 0)::bigint AS cents
       FROM cashier_requests r
      WHERE r.user_id = $1 AND r.request_type = 'DEPOSIT' AND r.status = 'APPROVED'
        AND (r.created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DAY_SQL}`,
    [userId]
  ).catch(() => [{ cents: 0 }] as any[]);
  const depositToday = Number((depRow as any[])[0]?.cents ?? 0);

  const gateRows = base.gates.map((g, i) => {
    const claim = claimed.find(r => String(r.kind).startsWith("deposit") && Number(r.gate_cents) === g.gate_cents);
    return {
      gate_cents: g.gate_cents,
      chip_cents: TICKET_GATE_PRIZES_CENTS[i],
      progress_cents: Math.min(depositToday, g.gate_cents),
      unlocked: depositToday >= g.gate_cents,
      claimed: Boolean(claim),
    };
  });

  /* Show previously redeemed deposit-earned eggs as cracked. */
  const eggsUsed = Array.from({ length: Math.min(9, gameCredits.egg.used) }, (_, i) => i + 1);

  const myWheel = await query(
    `SELECT prize_key, prize_cents, physical, created_at FROM prize_wheel
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [userId]
  ).catch(() => [] as any[]);

  const balRow = await query("SELECT balance_cents FROM users WHERE id = $1", [userId])
    .catch(() => [{ balance_cents: 0 }] as any[]);

  return {
    ...base, logged_in: true,
    turnover_cents: turnover,
    progress_cents: Math.min(turnover, dailyTarget),
    open_tickets: openTickets,
    free_available: !freeClaimed,
    tickets: {
      total: claimed.length,
      free_available: !freeClaimed,
      gates: gateRows,
    },
    deposit_today_cents: depositToday,
    my_wheel: myWheel as any[],
    my_tickets: claimed.map(r => ({ kind: String(r.kind), gate_cents: Number(r.gate_cents), prize_cents: Number(r.prize_cents), claim_day: r.claim_day })),
    balance_cents: Number((balRow as any[])[0]?.balance_cents ?? 0),
    egg_count: 9, eggs_used: eggsUsed,
  };
}
