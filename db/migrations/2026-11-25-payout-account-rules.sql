-- Payout wallets: one number per player per gateway, locked once bound.
--
-- Rules now enforced BY THE DATABASE, not just by the API:
--   • a player may bind a given bKash (or Nagad, or Upay) number only once;
--   • that number can never be handed to another player on the same gateway;
--   • a bound number can never be removed (there is no DELETE any more).
-- The same 01XXXXXXXXX can still be bound on a DIFFERENT gateway (bKash on one
-- account, Nagad on another) — that is why the unique key includes the channel.
BEGIN;

-- One row per (player, gateway, number) — replaces the old silent-dedupe index.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_owner_channel_number_uniq
  ON payout_accounts (user_id, channel, account_number);

-- A number belongs to exactly one player per gateway.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_channel_number_uniq
  ON payout_accounts (channel, account_number);

-- A player holds at most one number per gateway.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_one_per_channel
  ON payout_accounts (user_id, channel);

COMMIT;
