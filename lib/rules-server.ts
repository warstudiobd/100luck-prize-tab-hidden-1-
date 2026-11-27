/**
 * Server-only reader for the rules table. Imports `pg` through lib/db, so it
 * must NEVER be imported by a client component — use lib/useRules.ts there.
 */
import { query } from "./db";
import { RULES, type PublicRules } from "./rules";

/**
 * The operator's overrides from platform_settings, with RULES as the fallback.
 * A missing row behaves exactly like the default, so a fresh database and a
 * tuned one agree.
 */
export async function getRules(): Promise<PublicRules> {
  const keys = [
    "play_fee_cents",
    "prize_wheel_fee_cents",
    "withdraw_min_turnover_cents",
    "withdraw_min_amount_cents",
    "withdraw_max_amount_cents",
    "withdraw_daily_limit",
    "rebate_rate_bps",
    "reward_deposit_min_cents",
    "bonus_min_deposit_cents",
  ];

  const rows = await query(
    `SELECT key, value FROM platform_settings WHERE key = ANY($1)`,
    [keys]
  ).catch(() => [] as { key: string; value: string }[]);

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const n = Number(byKey.get(key));
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
  };

  return {
    play_fee_cents: num("play_fee_cents", RULES.playFeeCents),
    prize_wheel_fee_cents: 0, // retired paid-wheel setting
    withdraw_min_turnover_cents: num("withdraw_min_turnover_cents", RULES.withdrawMinTurnoverCents),
    withdraw_min_amount_cents: num("withdraw_min_amount_cents", RULES.withdrawMinAmountCents),
    withdraw_max_amount_cents: num("withdraw_max_amount_cents", RULES.withdrawMaxAmountCents),
    withdraw_daily_limit: num("withdraw_daily_limit", RULES.withdrawDailyLimit),
    rebate_rate_bps: num("rebate_rate_bps", RULES.rebateRateBps),
    reward_deposit_min_cents: num("reward_deposit_min_cents", RULES.rewardDepositMinCents),
    bonus_min_deposit_cents: num("bonus_min_deposit_cents", RULES.bonusMinDepositCents),
    /** Policy constants in lib/bonus.ts — not settings rows. */
    referral_bonus_cents: RULES.referralBonusCents,
    referral_deposit_min_cents: RULES.referralDepositMinCents,
    referral_wager_min_cents: RULES.referralWagerMinCents,
    wager_per_ticket_cents: RULES.wagerPerTicketCents,
  };
}
