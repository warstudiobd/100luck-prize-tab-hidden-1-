/**
 * Daily reward center — the 499bet "পুরস্কার" screen.
 *
 *   GET  /api/rewards
 *        can_login  — today's login prize is still unclaimed (Asia/Dhaka day)
 *        can_egg    — today's egg smash is still unclaimed
 *        ends_at    — next midnight Asia/Dhaka (the "অবশিষ্ট সময়" countdown)
 *        max_login_prize_cents — platform setting (default ৳99,999, i.e. no cap)
 *        recent     — the last winners, masked, from the BONUS ledger
 *
 *   POST /api/rewards  { kind: "login" | "egg", egg?: 1..9 }
 *
 * Login bonus: free, one per Asia/Dhaka day.
 * Egg smash:   PAID PLAY since v36 — ৳2.99 per egg, unlimited per day. The free
 *               ৳500-deposit + 1× wager gate is gone; the price is the gate.
 *
 * Both prizes are real money credited to the wallet as BONUS inside the same
 * transaction that writes the ledger row (and, for eggs, that takes the fee).
 * The client renders a purely cosmetic reveal; the amount is decided here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { BONUS_CREDIT_SQL, creditBonusInTx } from "@/lib/bonus";

export const dynamic = "force-dynamic";

const LOGIN_PRIZES = [200, 300, 500, 800, 1_200, 2_000, 5_000]; // cents → ৳2 – ৳50
const LOGIN_WEIGHTS = [30, 25, 18, 12, 8, 5, 2];                 // 100
const DAY_SQL = "(now() AT TIME ZONE 'Asia/Dhaka')::date";
const EGG_COUNT = 9;

function pick<T>(items: T[], weights: number[]): { value: T; index: number } {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.floor(Math.random() * total);
  for (let i = 0; i < items.length; i++) {
    if (roll < weights[i]) return { value: items[i], index: i };
    roll -= weights[i];
  }
  return { value: items[0], index: 0 };
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const claimed = await query(
    `SELECT kind FROM reward_claims WHERE user_id = $1 AND claim_day = ${DAY_SQL}`,
    [userId]
  ).catch(() => [] as any[]);
  const done = new Set((claimed as any[]).map(r => String(r.kind)));

  const limits = await query(
    "SELECT key, value FROM platform_settings WHERE key IN ('daily_login_max_prize_cents','withdraw_daily_limit')"
  ).catch(() => [] as any[]);
  const setting = Object.fromEntries((limits as any[]).map(r => [String(r.key), String(r.value)]));

  // Next midnight in Asia/Dhaka, as an ISO instant the client can count down to.
  const ends = await query(
    `SELECT ((now() AT TIME ZONE 'Asia/Dhaka')::date + 1)::timestamp AT TIME ZONE 'Asia/Dhaka' AS ends_at`
  ).catch(() => [{ ends_at: null }]);

  // Recent winners — real bonus credits, usernames masked the way the reference does.
  // One row per player (their biggest win in the window) and never the viewer's
  // own name: a list that repeats the same account five times reads as fake.
  const recent = await query(
    `SELECT u.username_or_phone AS who, l.amount_cents, l.created_at
       FROM (
         SELECT DISTINCT ON (user_id) user_id, amount_cents, created_at
           FROM wallet_ledger
          WHERE ${BONUS_CREDIT_SQL}
            AND user_id <> $1
            AND amount_cents > 0
          ORDER BY user_id, amount_cents DESC
       ) l
       JOIN users u ON u.id = l.user_id
      ORDER BY l.amount_cents DESC, l.created_at DESC
      LIMIT 8`,
    [userId]
  ).catch(() => [] as any[]);

  const masked = (recent as any[]).map(r => {
    const who = String(r.who ?? "");
    return {
      who: who.length > 4 ? `${who.slice(0, 2)}${"*".repeat(Math.max(3, who.length - 4))}${who.slice(-2)}` : who,
      amount_cents: Number(r.amount_cents),
      created_at: r.created_at,
    };
  });

  // Egg plays are free and deposit-earned; never read or charge a play fee.
  const [{ balance_cents: balanceCents }] = await query(
    "SELECT balance_cents FROM users WHERE id = $1", [userId]
  );
  const eggCredits = await query(
    "SELECT COUNT(*)::int AS n FROM prize_game_credits WHERE user_id = $1 AND game_key = 'egg' AND redeemed_at IS NULL",
    [userId]
  ).catch(() => [{ n: 0 }] as any[]);
  const eggAvailable = Number((eggCredits as any[])[0]?.n ?? 0);

  return NextResponse.json({
    ok: true,
    can_login: !done.has("login"),
    can_egg: eggAvailable > 0,
    claimed_login: done.has("login"),
    claimed_egg: eggAvailable === 0,
    fee_cents: 0,
    egg_spins_available: eggAvailable,
    balance_cents: Number(balanceCents ?? 0),
    ends_at: (ends as any)[0]?.ends_at ?? null,
    daily_login_max_prize_cents: Number(setting.daily_login_max_prize_cents ?? 9_999_900),
    egg_count: EGG_COUNT,
    recent: masked,
  });
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  if (kind === "egg") {
    return NextResponse.json({ ok: false, code: "paid_egg_retired", error: "Paid egg plays are disabled. Use the free deposit-earned Golden Egg play." }, { status: 410 });
  }
  if (kind !== "login") return NextResponse.json({ ok: false, error: "kind must be 'login'" }, { status: 400 });

  try {
    const out = await withTransaction(async client => {
      const locked = await client.query("SELECT is_blocked FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!locked.rows[0]) return { status: 404 as const, error: "user not found" };
      if (locked.rows[0].is_blocked) return { status: 403 as const, error: "account is blocked" };
      const prize = pick(LOGIN_PRIZES, LOGIN_WEIGHTS);
      const ins = await client.query(
        `INSERT INTO reward_claims (user_id, kind, claim_day, prize_index, prize_cents, fee_cents)
         VALUES ($1, 'login', ${DAY_SQL}, NULL, $2, 0)
         ON CONFLICT (user_id, kind, claim_day) DO NOTHING RETURNING id`,
        [userId, prize.value]
      );
      if (!ins.rows[0]) return { status: 409 as const, error: "login bonus already claimed today", code: "already_claimed" };
      const claimId = Number(ins.rows[0].id);
      const balance = await creditBonusInTx(client, {
        userId, deltaCents: prize.value, callId: `bns_login_${claimId}`, subtype: "daily_login",
      });
      return { status: 200 as const, kind, egg: null, prize_cents: prize.value, fee_cents: 0, balance_cents: balance };
    });
    if (out.status !== 200) return NextResponse.json({ ok: false, ...out }, { status: out.status });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("[rewards] failed", e);
    return NextResponse.json({ ok: false, error: "reward failed" }, { status: 500 });
  }
}
