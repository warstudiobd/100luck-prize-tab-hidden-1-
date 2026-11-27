export const GAME_CATEGORIES = ["SLOTS", "LIVE", "CRASH", "TABLE", "INSTANT", "FISHING", "BINGO", "KENO", "VIRTUAL", "SPORTSBOOK", "POKER", "SPORTS", "OTHER"] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];
export interface GameRow {
  id: number; provider_code: string; game_code: string; title: string; title_bn: string;
  category: GameCategory; thumbnail_url: string; is_favorite_default: boolean; is_hot: boolean; sort_order: number;
}
export interface LedgerRow {
  id: number; call_id: string | null; user_id: number; provider_code: string; game_code: string;
  action_type: string; tx_subtype: string; amount_cents: number;
  balance_before_cents: number; balance_after_cents: number; created_at: string;
}
export interface CashierRequestRow {
  id: number; user_id: number; request_type: "DEPOSIT" | "WITHDRAW"; channel: "bKash" | "Nagad" | "Rocket";
  account_ref: string; trx_ref: string; amount_cents: number; status: "PENDING" | "APPROVED" | "REJECTED"; created_at: string;
  username_or_phone?: string;
}
export interface SessionUser {
  id: number; username_or_phone: string; balance_cents: number; currency: string;
  vip_level: number; referral_code: string; is_admin: boolean; created_at: string;
  phone: string | null;
}
