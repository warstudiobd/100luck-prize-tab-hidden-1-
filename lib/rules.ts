/**
 * 100LUCK — THE RULES TABLE (client-safe).
 *
 * Every player-facing number that has a *rule* behind it lives here or in
 * platform_settings. Nothing else should hardcode one.
 *
 * This file is imported by BOTH the browser and the server, so it must stay
 * free of `pg` / node-only imports. The DB reader lives in lib/rules-server.ts.
 *
 * When you change a fee:
 *     UPDATE platform_settings SET value = '...' WHERE key = '...';
 * the UI follows within a minute, and update RULES.md in the same commit.
 */

/** Cents in, cents out — ৳1 = 100 cents, exactly like the ledger. */
export const RULES = {
  /** Paid play: one lucky spin or one golden egg. */
  playFeeCents: 299,
  /** Retired: the Lucky Wheel is free, earned per successful ৳500+ deposit. */
  prizeWheelFeeCents: 0,
  /** Minimum a player must wager (game bets only) before cashing out. */
  withdrawMinTurnoverCents: 50_000,
  /** Hard floor on a single withdrawal request. Enforced server-side.
   *  ৳500 — the same floor PayWise itself enforces on a BDT payout, so a smaller
   *  request could never be settled anyway; refusing it up front is kinder than
   *  accepting it and failing at the provider. */
  withdrawMinAmountCents: 500_00,
  /** Hard ceiling on a single withdrawal request. */
  withdrawMaxAmountCents: 100_000_000,
  /** Withdrawals allowed per player per day. */
  withdrawDailyLimit: 99_999,
  /** Rebate = turnover × bps/10000. 5 bps = 0.05%. */
  rebateRateBps: 5,
  /** Referral: inviter is paid when the invited friend clears BOTH of these. */
  referralBonusCents: 30_000,
  referralDepositMinCents: 50_000,
  referralWagerMinCents: 300_000,
  /** Deposit needed before deposit-gated rewards unlock. */
  rewardDepositMinCents: 50_000,
  bonusMinDepositCents: 50_000,
  /** One red-envelope ticket per this much real turnover. */
  wagerPerTicketCents: 100_000,
} as const;

/** The shape /api/rules returns and useRules() hands to components. */
export type PublicRules = {
  play_fee_cents: number;
  prize_wheel_fee_cents: number;
  withdraw_min_turnover_cents: number;
  withdraw_min_amount_cents: number;
  withdraw_max_amount_cents: number;
  withdraw_daily_limit: number;
  rebate_rate_bps: number;
  reward_deposit_min_cents: number;
  bonus_min_deposit_cents: number;
  referral_bonus_cents: number;
  referral_deposit_min_cents: number;
  referral_wager_min_cents: number;
  wager_per_ticket_cents: number;
};

/** Used for first paint, and whenever /api/rules can't be reached. */
export const RULES_FALLBACK: PublicRules = {
  play_fee_cents: RULES.playFeeCents,
  prize_wheel_fee_cents: RULES.prizeWheelFeeCents,
  withdraw_min_turnover_cents: RULES.withdrawMinTurnoverCents,
  withdraw_min_amount_cents: RULES.withdrawMinAmountCents,
  withdraw_max_amount_cents: RULES.withdrawMaxAmountCents,
  withdraw_daily_limit: RULES.withdrawDailyLimit,
  rebate_rate_bps: RULES.rebateRateBps,
  reward_deposit_min_cents: RULES.rewardDepositMinCents,
  bonus_min_deposit_cents: RULES.bonusMinDepositCents,
  referral_bonus_cents: RULES.referralBonusCents,
  referral_deposit_min_cents: RULES.referralDepositMinCents,
  referral_wager_min_cents: RULES.referralWagerMinCents,
  wager_per_ticket_cents: RULES.wagerPerTicketCents,
};

/** ৳2.99 — always two decimals, the way the marketing copy writes it. */
export function taka(cents: number): string {
  return `৳${(cents / 100).toFixed(2)}`;
}

/** ৳50,000 — no decimals, for round amounts. */
export function takaRound(cents: number): string {
  return `৳${(cents / 100).toLocaleString("en-IN")}`;
}
