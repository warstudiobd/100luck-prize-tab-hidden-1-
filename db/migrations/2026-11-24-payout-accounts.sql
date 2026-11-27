-- v12 — bound payout wallets (499bet "ই-ওয়ালেট বাঁধুন" flow)
--
-- A player binds up to MAX_ACCOUNTS_PER_CHANNEL wallet numbers per gateway and can
-- then only withdraw to one of those numbers. Nothing is verified automatically:
-- the number belongs to the player, and the admin reviews it with the payout.
--
-- account_number is stored in clear (the admin must be able to send money to it)
-- and only ever leaves the server masked for the owner's own screen.

CREATE TABLE IF NOT EXISTS payout_accounts (
  id             serial PRIMARY KEY,
  user_id        bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel        text   NOT NULL,
  account_number text   NOT NULL,
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One binding per (player, channel, number); a second identical add is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_owner_uniq
  ON payout_accounts (user_id, channel, account_number);

CREATE INDEX IF NOT EXISTS payout_accounts_user_idx
  ON payout_accounts (user_id, channel, created_at);
