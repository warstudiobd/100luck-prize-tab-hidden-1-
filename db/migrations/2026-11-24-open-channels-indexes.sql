-- Applied to Supabase project xhzwdoaldwgsfgvdrmah on 2026-11-24 (two migrations).

-- 1) Cashier channels are admin-managed data now: bKash/Nagad/Rocket plus any
--    gateway an admin adds. The legacy CHECK rejected every new gateway.
ALTER TABLE cashier_requests DROP CONSTRAINT IF EXISTS cashier_requests_channel_check;
ALTER TABLE cashier_requests
  ADD CONSTRAINT cashier_requests_channel_len_check
  CHECK (char_length(channel) BETWEEN 2 AND 16);

-- 2) Provider leaderboard aggregates wallet_ledger by provider_code + window.
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_provider_time
  ON wallet_ledger (provider_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_catalog_provider_active
  ON games_catalog (provider_id, is_active);
