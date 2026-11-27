/**
 * SONALI7 — platform settings (admin-editable switches)
 *
 * Small key/value store so operational rules can be changed from the admin
 * panel without a deploy. Reads are cheap and always fresh (no cache) — these
 * are hit at most once per cashier action.
 */
import { query } from "./db";

export const SETTING_KEYS = {
  /** Flat turnover a player must wager before a withdrawal is allowed. */
  withdrawMinTurnover: "withdraw_min_turnover_cents",
  /** Shown on the deposit screen under the amount field. */
  withdrawNotice: "withdraw_notice",
  /** Public site address used for PayWise return/webhook URLs (e.g. https://warstudio.site). */
  siteUrl: "site_url",
  /** Exact callback PayWise must POST to; defaults to <siteUrl>/api/payments/paywise/webhook. */
  paywiseWebhookUrl: "paywise_webhook_url",
} as const;

export async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const [row] = await query("SELECT value FROM platform_settings WHERE key = $1", [key]);
    return row?.value != null ? String(row.value) : fallback;
  } catch {
    return fallback; // migration not applied yet — behave like the default
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

/** Flat withdrawal turnover requirement, in cents (default ৳2,000). */
export async function getWithdrawTurnoverCents(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.withdrawMinTurnover, "200000");
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : 200_000;
}

/**
 * Lifetime wagers (game bets only) for a player, in cents.
 * DEBIT ledger rows written by the seamless wallet are bets; cashier/bonus
 * rows are excluded so deposits or bonus credits never count as turnover.
 */
export async function getWageredCents(userId: number): Promise<number> {
  const [row] = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s
       FROM wallet_ledger
      WHERE user_id = $1
        AND action_type = 'DEBIT'
        AND provider_code NOT IN ('CASHIER', 'BONUS', '')`,
    [userId]
  );
  return Number(row?.s ?? 0);
}

/** { requiredCents, wageredCents, remainingCents, ok } for the withdraw screen. */
export async function getWithdrawRequirement(userId: number) {
  const [requiredCents, wageredCents] = await Promise.all([getWithdrawTurnoverCents(), getWageredCents(userId)]);
  const remainingCents = Math.max(0, requiredCents - wageredCents);
  return { requiredCents, wageredCents, remainingCents, ok: remainingCents === 0 };
}
