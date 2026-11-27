/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reward gate — do the daily rewards have to be *earned*?
 *
 *  RULE (platform_setting `reward_gate_enabled`, default ON):
 *    A player may claim today's login prize, egg smash and lucky spin only when,
 *    for the current Asia/Dhaka day:
 *      1. approved deposits  ≥ reward_deposit_min_cents   (default ৳500)
 *      2. qualifying wager   ≥ today's deposit × reward_wager_mult_bps
 *                                                            (default 1.00×)
 *
 *  Both numbers are read from the real tables (cashier_requests / wallet_ledger);
 *  nothing is cached, so a deposit approved a second ago counts immediately.
 *
 *  Why the gate exists: before it, any account — with no deposit and no play —
 *  could collect all three prizes every day (EV ≈ ৳62/day, ≈ ৳22,700/year).
 *  Because wallet funds are withdrawable, that was a direct cash leak on
 *  throwaway registrations.
 *
 *  Set reward_gate_enabled=0 to return to ungated prizes without a deploy.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { query } from "./db";

export const DHAKA_DAY = `(now() AT TIME ZONE 'Asia/Dhaka')::date`;
export const DHAKA_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')`;

export interface GateConfig {
  enabled: boolean;
  minDepositCents: number;
  wagerMultBps: number;
  vipUnlockCents: number;
}

export interface GateState {
  ok: boolean;                 // may the player claim today?
  enabled: boolean;
  depositCents: number;        // today's approved deposits
  wagerCents: number;          // today's qualifying turnover
  requiredDepositCents: number;
  requiredWagerCents: number;
  depositMet: boolean;
  wagerMet: boolean;
  /** Which hurdle is missing — order matters for the message we show. */
  reason: "ok" | "no_deposit" | "wager_short";
  /** Lifetime approved deposits — drives the VIP unlock (৳500). */
  lifetimeDepositCents: number;
  vipUnlocked: boolean;
  vipUnlockCents: number;
}

const DEFAULTS: GateConfig = {
  enabled: true,
  minDepositCents: 50_000,
  wagerMultBps: 10_000,
  vipUnlockCents: 50_000,
};

export async function getGateConfig(): Promise<GateConfig> {
  const rows = await query(
    `SELECT key, value FROM platform_settings
      WHERE key IN ('reward_gate_enabled','reward_deposit_min_cents',
                    'reward_wager_mult_bps','vip_unlock_deposit_cents')`
  ).catch(() => [] as any[]);
  const s = Object.fromEntries((rows as any[]).map(r => [String(r.key), String(r.value)]));
  const num = (k: string, fallback: number) => {
    const n = Number(s[k]);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    enabled: s.reward_gate_enabled === undefined ? DEFAULTS.enabled : s.reward_gate_enabled === "1",
    minDepositCents: num("reward_deposit_min_cents", DEFAULTS.minDepositCents),
    wagerMultBps: num("reward_wager_mult_bps", DEFAULTS.wagerMultBps),
    vipUnlockCents: num("vip_unlock_deposit_cents", DEFAULTS.vipUnlockCents),
  };
}

/** Today's approved deposits + today's qualifying wager + lifetime deposits. */
export async function readGateNumbers(userId: number) {
  const [today] = await query(
    `SELECT
       COALESCE((SELECT SUM(amount_cents) FROM cashier_requests
                  WHERE user_id = $1 AND request_type = 'DEPOSIT' AND status = 'APPROVED'
                    AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_DAY}), 0)::bigint AS dep_today,
       COALESCE((SELECT SUM(amount_cents) FROM wallet_ledger
                  WHERE user_id = $1 AND action_type = 'DEBIT'
                    AND provider_code NOT IN ('CASHIER','BONUS','')
                    AND created_at >= ${DHAKA_DAY_START}), 0)::bigint AS wager_today,
       COALESCE((SELECT SUM(amount_cents) FROM cashier_requests
                  WHERE user_id = $1 AND request_type = 'DEPOSIT' AND status = 'APPROVED'), 0)::bigint AS dep_life`,
    [userId]
  ).catch(() => [{ dep_today: 0, wager_today: 0, dep_life: 0 }]);
  return {
    depositCents: Number((today as any)?.dep_today ?? 0),
    wagerCents: Number((today as any)?.wager_today ?? 0),
    lifetimeDepositCents: Number((today as any)?.dep_life ?? 0),
  };
}

/** Full gate state for one player — what the rewards screens render. */
export async function getGateState(userId: number): Promise<GateState> {
  const [cfg, nums] = await Promise.all([getGateConfig(), readGateNumbers(userId)]);
  const requiredDepositCents = cfg.minDepositCents;
  const requiredWagerCents = Math.floor((nums.depositCents * cfg.wagerMultBps) / 10_000);
  const depositMet = !cfg.enabled || nums.depositCents >= requiredDepositCents;
  const wagerMet = !cfg.enabled || (nums.depositCents >= requiredDepositCents && nums.wagerCents >= requiredWagerCents);
  const ok = depositMet && wagerMet;
  return {
    ok,
    enabled: cfg.enabled,
    depositCents: nums.depositCents,
    wagerCents: nums.wagerCents,
    requiredDepositCents,
    requiredWagerCents,
    depositMet,
    wagerMet,
    reason: ok ? "ok" : !depositMet ? "no_deposit" : "wager_short",
    lifetimeDepositCents: nums.lifetimeDepositCents,
    vipUnlocked: nums.lifetimeDepositCents >= cfg.vipUnlockCents,
    vipUnlockCents: cfg.vipUnlockCents,
  };
}

/**
 * Server-side enforcement. Call at the top of every prize-claiming handler,
 * inside or before its transaction — it re-reads the tables each time, so a
 * client can never claim a prize the ledger does not justify.
 */
export async function assertCanClaim(userId: number): Promise<{ ok: true; gate: GateState } | { ok: false; gate: GateState; error: string; error_bn: string }> {
  const gate = await getGateState(userId);
  if (gate.ok) return { ok: true, gate };
  if (gate.reason === "no_deposit") {
    return {
      ok: false, gate,
      error: `Deposit at least ৳${(gate.requiredDepositCents / 100).toLocaleString("en-IN")} today to unlock daily rewards`,
      error_bn: `আজ কমপক্ষে ৳${(gate.requiredDepositCents / 100).toLocaleString("en-IN")} ডিপোজিট করুন — তারপর পুরস্কার নিতে পারবেন`,
    };
  }
  const short = Math.max(0, gate.requiredWagerCents - gate.wagerCents);
  return {
    ok: false, gate,
    error: `Wager ৳${(short / 100).toLocaleString("en-IN")} more today to unlock daily rewards`,
    error_bn: `আর ৳${(short / 100).toLocaleString("en-IN")} বাজি ধরুন — তারপর পুরস্কার নিতে পারবেন`,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 *  "No deposit, no bonus" — the second half of the rule.
 *
 *  The daily prizes need a deposit *today* (getGateState above). Every other
 *  bonus — mission rewards, daily rebate, invite ladder — only needs the player
 *  to have deposited once, ever: an established player should not lose their
 *  rebate because they topped up yesterday instead of this morning. A brand-new
 *  account that never paid anything cannot withdraw a single taka of bonus.
 *
 *  Settings: bonus_gate_enabled (1/0), bonus_min_deposit_cents (default ৳500).
 *
 *  HOW IT IS MEASURED (operator decision, v68): the player needs ONE approved
 *  deposit of at least bonus_min_deposit_cents. It is NOT a cumulative sum.
 *  Two ৳300 deposits do not unlock bonuses; a single ৳300 deposits never will.
 *  The deposit floor (৳300, deposit_channels) is deliberately lower than this
 *  gate, so ৳300 deposits are accepted and playable but earn no bonuses.
 *  Checked 2026-11-26: every qualifying account had made a single ৳500 payment,
 *  so this measure matched the old cumulative one exactly — nobody lost access.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface DepositGate {
  ok: boolean;
  enabled: boolean;
  /** Largest single approved deposit, in cents (NOT a cumulative sum). */
  lifetimeDepositCents: number;
  requiredDepositCents: number;
}

export async function getDepositGateState(userId: number): Promise<DepositGate> {
  const rows = await query(
    `SELECT key, value FROM platform_settings
      WHERE key IN ('bonus_gate_enabled','bonus_min_deposit_cents')`
  ).catch(() => [] as any[]);
  const s = Object.fromEntries((rows as any[]).map(r => [String(r.key), String(r.value)]));
  const enabled = s.bonus_gate_enabled === undefined ? true : s.bonus_gate_enabled === "1";
  const required = Number(s.bonus_min_deposit_cents ?? DEFAULTS.minDepositCents) || DEFAULTS.minDepositCents;
  // Biggest SINGLE approved deposit — the gate is "did you ever pay ৳500 once",
  // not "have you paid ৳500 in total". See the header note.
  const [{ dep_life }] = (await query(
    `SELECT COALESCE((SELECT MAX(amount_cents) FROM cashier_requests
                       WHERE user_id = $1 AND request_type = 'DEPOSIT' AND status = 'APPROVED'), 0)::bigint AS dep_life`,
    [userId]
  ).catch(() => [{ dep_life: 0 }])) as any[];
  const lifetimeDepositCents = Number(dep_life ?? 0);
  return {
    ok: !enabled || lifetimeDepositCents >= required,
    enabled,
    lifetimeDepositCents,
    requiredDepositCents: required,
  };
}

/** Server-side enforcement for every bonus that is not a daily prize. */
export async function assertHasDeposited(
  userId: number
): Promise<{ ok: true; gate: DepositGate } | { ok: false; gate: DepositGate; error: string; error_bn: string; code: string }> {
  const gate = await getDepositGateState(userId);
  if (gate.ok) return { ok: true, gate };
  const amt = (gate.requiredDepositCents / 100).toLocaleString("en-IN");
  return {
    ok: false,
    gate,
    code: "deposit_required",
    error: `Make one deposit of at least ৳${amt} to unlock bonuses`,
    error_bn: `বোনাস পেতে কমপক্ষে ৳${amt} এর একটি ডিপোজিট করুন — ডিপোজিট ছাড়া বোনাস নেই`,
  };
}
