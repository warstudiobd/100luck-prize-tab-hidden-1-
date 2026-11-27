/**
 * SONALI7 — Bonus engine (2026-11-23)
 *
 * 1) Referral bonus: ৳300 to the referrer, paid INSIDE the transaction that
 *    completes the referee's qualification, exactly once per referred friend.
 *    Qualification (evaluated on every deposit approval AND every game bet
 *    DEBIT): cumulative approved DEPOSITS ≥ ৳500 AND cumulative game wagers
 *    ≥ ৳3,000, counting only activity on/after REFERRAL_EFFECTIVE_AT
 *    (2026-11-23, Asia/Dhaka) — the pre-existing first-deposit rule is retired
 *    and no past activity is back-paid. Conditions are intentionally NOT shown
 *    to players anywhere in the UI. Recorded in bonus_referrals
 *    (referred_id UNIQUE → never double-pays).
 *
 * 2) Lucky Spin: since v36 a PAID play — ৳2.99 per spin, unlimited, no daily cap
 *    and no deposit gate (see chargePlayFeeInTx below).
 *    Weighted random prize chosen server-side (crypto), row locked, prize
 *    credited as BONUS ledger entry, lucky_spins(user_id, spin_day) UNIQUE.
 *
 * There is NO deposit bonus and NO welcome bonus anymore (2026-11-23 spec).
 */
import crypto from "crypto";

export const REFERRAL_BONUS_CENTS = 30_000; // ৳300

export interface SpinPrize { key: string; cents: number; weight: number; labelEn: string; labelBn: string }
export const SPIN_PRIZES: SpinPrize[] = [
  { key: "p10",   cents: 1_000,   weight: 45, labelEn: "৳10",   labelBn: "৳১০" },
  { key: "p25",   cents: 2_500,   weight: 30, labelEn: "৳25",   labelBn: "৳২৫" },
  { key: "p50",   cents: 5_000,   weight: 15, labelEn: "৳50",   labelBn: "৳৫০" },
  { key: "p100",  cents: 10_000,  weight: 7,  labelEn: "৳100",  labelBn: "৳১০০" },
  { key: "p300",  cents: 30_000,  weight: 2,  labelEn: "৳300",  labelBn: "৳৩০০" },
  { key: "p1000", cents: 100_000, weight: 1,  labelEn: "৳1,000", labelBn: "৳১,০০০" },
];

/** Weighted random pick (crypto-secure). */
export function pickSpinPrize(): SpinPrize {
  const total = SPIN_PRIZES.reduce((s, p) => s + p.weight, 0); // 100
  let roll = crypto.randomInt(total);
  for (const p of SPIN_PRIZES) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return SPIN_PRIZES[0];
}

/** Referral rule effective date (Asia/Dhaka). Only deposits approved and
 *  wagers debited at/after this instant count toward qualification —
 *  pre-existing activity is never back-paid. */
export const REFERRAL_EFFECTIVE_AT = "2026-11-23T00:00:00+06:00";
export const REFERRAL_DEPOSIT_MIN_CENTS = 50_000;   // ৳500 cumulative approved deposits
export const REFERRAL_WAGER_MIN_CENTS   = 300_000;  // ৳3,000 cumulative game bets

/**
 * SQL predicate for "this wallet_ledger row is a bonus/prize credit".
 *
 * IMPORTANT: creditBonusInTx() writes action_type = 'BONUS' (not 'CREDIT'), so any
 * query that filters action_type = 'CREDIT' silently returns nothing. This bug bit
 * the member badges, the cashier bonus total and the rewards winners list — always
 * use this predicate instead of hand-writing the condition.
 */
export const BONUS_CREDIT_SQL = "action_type IN ('BONUS','CREDIT') AND provider_code = 'BONUS'";

/** Asia/Dhaka calendar day for the one-spin-per-day rule. */
export const SPIN_DAY_SQL = "(now() AT TIME ZONE 'Asia/Dhaka')::date";

/** Credit a BONUS ledger entry inside an existing transaction client.
 *  Returns the new balance. Caller supplies an already-locked user row read. */
export async function creditBonusInTx(
  client: any,
  args: { userId: number; deltaCents: number; callId: string; subtype: string; provider?: string }
): Promise<number> {
  const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [args.userId]);
  if (!locked.rows[0]) throw new Error("bonus: user not found");
  const before = Number(locked.rows[0].balance_cents);
  const after = before + args.deltaCents;
  await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, args.userId]);
  await client.query(
    `INSERT INTO wallet_ledger
       (call_id, user_id, provider_code, game_code, action_type, tx_subtype,
        amount_cents, balance_before_cents, balance_after_cents)
     VALUES ($1,$2,$3,'','BONUS',$4,$5,$6,$7)
     ON CONFLICT (call_id) DO NOTHING`,
    [args.callId, args.userId, args.provider ?? "BONUS", args.subtype, args.deltaCents, before, after]
  );
  return after;
}

/**
 * Pay the referral bonus for a referee who just completed a qualifying event —
 * MUST run inside the transaction that applied the event.
 * source        — what triggered this check ('deposit' approve or 'wager' debit)
 * Pays out only when ALL hold:
 *   - depositor has a referred_by set (and it is not self)
 *   - cumulative approved deposits (since REFERRAL_EFFECTIVE_AT) ≥ ৳500
 *   - cumulative game-bet DEBIT wagers (since REFERRAL_EFFECTIVE_AT) ≥ ৳3,000
 *   - no bonus_referrals row exists yet for this referred user (UNIQUE + ON CONFLICT)
 * Returns { paid, referrerId, amountCents } or { paid: false }.
 */
export async function maybePayReferralBonus(
  client: any,
  depositorId: number,
  sourceRequestId: number | null,
  source: "deposit" | "wager" = "deposit"
): Promise<{ paid: boolean; referrerId?: number; amountCents?: number }> {
  const u = await client.query("SELECT referred_by FROM users WHERE id = $1", [depositorId]);
  const referrer = u.rows[0]?.referred_by ? Number(u.rows[0].referred_by) : null;
  if (!referrer || referrer === depositorId) return { paid: false };

  // Fast reject: already paid once for this referred friend?
  const already = await client.query("SELECT 1 FROM bonus_referrals WHERE referred_id = $1", [depositorId]);
  if (already.rows[0]) return { paid: false };

  // Count deposits APPROVED at/after the effective date — the approval ledger row
  // (call_id csh_dep_appr_<id>) is written by both the manual decision endpoint and
  // the gateway callback, so approval time is the honest "deposit happened" moment.
  const dep = await client.query(
    `SELECT COALESCE(SUM(l.amount_cents), 0)::bigint AS s
       FROM cashier_requests r
       JOIN wallet_ledger l ON l.call_id = 'csh_dep_appr_' || r.id::text
      WHERE r.user_id = $1 AND r.request_type = 'DEPOSIT' AND r.status = 'APPROVED'
        AND l.created_at >= $2`,
    [depositorId, REFERRAL_EFFECTIVE_AT]
  );
  if (Number(dep.rows[0]?.s ?? 0) < REFERRAL_DEPOSIT_MIN_CENTS) return { paid: false };

  const wag = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
       FROM wallet_ledger
      WHERE user_id = $1 AND action_type = 'DEBIT' AND created_at >= $2`,
    [depositorId, REFERRAL_EFFECTIVE_AT]
  );
  if (Number(wag.rows[0]?.s ?? 0) < REFERRAL_WAGER_MIN_CENTS) return { paid: false };

  const ins = await client.query(
    `INSERT INTO bonus_referrals (referrer_id, referred_id, deposit_request_id, amount_cents)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (referred_id) DO NOTHING
     RETURNING id`,
    [referrer, depositorId, source === "deposit" ? sourceRequestId : null, REFERRAL_BONUS_CENTS]
  );
  if (!ins.rows[0]) return { paid: false }; // already paid once for this referred user

  await creditBonusInTx(client, {
    userId: referrer,
    deltaCents: REFERRAL_BONUS_CENTS,
    callId: `bns_ref2_${depositorId}`,
    subtype: "referral_bonus",
  });
  return { paid: true, referrerId: referrer, amountCents: REFERRAL_BONUS_CENTS };
}

/** Cheap pre-check used on the bet hot-path before running the full sums. */
export async function checkReferralOnWager(client: any, userId: number): Promise<void> {
  const u = await client.query("SELECT referred_by FROM users WHERE id = $1", [userId]);
  const referrer = u.rows[0]?.referred_by ? Number(u.rows[0].referred_by) : null;
  if (!referrer || referrer === userId) return;
  const already = await client.query("SELECT 1 FROM bonus_referrals WHERE referred_id = $1", [userId]);
  if (already.rows[0]) return;
  await maybePayReferralBonus(client, userId, null, "wager");
}

/* ───────────────────────────────────────────────────────────────────────────
 *  Paid plays (v36): Lucky Spin and Egg Smash cost ৳2.99 each.
 *
 *  The old ৳500-deposit + 1× wager gate is gone; the price IS the gate, so the
 *  charge and the prize both happen inside one transaction: if the wallet is
 *  short nothing is written, if the prize fails the fee is rolled back with it.
 * ─────────────────────────────────────────────────────────────────────────── */

export const PLAY_FEE_CENTS = 299; // ৳2.99 per spin / per egg

/** Fee from platform_settings when the operator changed it, else ৳2.99. */
export async function getPlayFeeCents(): Promise<number> {
  const { query } = await import("./db");
  const rows = await query("SELECT value FROM platform_settings WHERE key = 'play_fee_cents'").catch(() => [] as any[]);
  const n = Number((rows as any[])[0]?.value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : PLAY_FEE_CENTS;
}

/**
 * Festival-wheel spin price. The wheel pays out an expected ৳6.92 a spin
 * (weights in lib/prize-wheel.ts), so it costs more than the ৳2.99 eggs/spins:
 * ৳9.99 keeps ~69% return to the player and the operator solvent. Operator can
 * change it with platform_settings.prize_wheel_fee_cents.
 */
export const PRIZE_WHEEL_FEE_CENTS = 999;
export async function getPrizeWheelFeeCents(): Promise<number> {
  const { query } = await import("./db");
  const rows = await query("SELECT value FROM platform_settings WHERE key = 'prize_wheel_fee_cents'").catch(() => [] as any[]);
  const n = Number((rows as any[])[0]?.value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : PRIZE_WHEEL_FEE_CENTS;
}

/**
 * Take the play fee from the wallet inside the caller's transaction.
 * Writes a DEBIT ledger row (`action_type='DEBIT'`, provider PAIDPLAY) so the
 * money trail matches a game bet, and returns the balance after the charge.
 * Throws PLAY_INSUFFICIENT (with balances attached) when the wallet is short.
 */
export async function chargePlayFeeInTx(
  client: any,
  args: { userId: number; feeCents: number; callId: string; subtype: string }
): Promise<number> {
  const locked = await client.query("SELECT balance_cents, is_blocked FROM users WHERE id = $1 FOR UPDATE", [args.userId]);
  if (!locked.rows[0]) throw new Error("play: user not found");
  if (locked.rows[0].is_blocked) throw new Error("play: account blocked");
  const before = Number(locked.rows[0].balance_cents);
  if (before < args.feeCents) {
    const err: any = new Error("insufficient balance");
    err.code = "PLAY_INSUFFICIENT";
    err.balance = before;
    err.fee = args.feeCents;
    throw err;
  }
  const after = before - args.feeCents;
  await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, args.userId]);
  await client.query(
    `INSERT INTO wallet_ledger
       (call_id, user_id, provider_code, game_code, action_type, tx_subtype,
        amount_cents, balance_before_cents, balance_after_cents)
     VALUES ($1,$2,'PAIDPLAY','', 'DEBIT',$3,$4,$5,$6)
     ON CONFLICT (call_id) DO NOTHING`,
    [args.callId, args.userId, args.subtype, args.feeCents, before, after]
  );
  return after;
}
