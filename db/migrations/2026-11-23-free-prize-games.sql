-- One no-wager play entitlement per game for each newly approved deposit >= ৳500.
-- Historical deposits are intentionally not backfilled.
CREATE TABLE IF NOT EXISTS prize_game_credits (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_request_id BIGINT NOT NULL REFERENCES cashier_requests(id),
  game_key TEXT NOT NULL CHECK (game_key IN ('wheel','egg','envelope','mail')),
  prize_cents BIGINT,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prize_game_credits_one_per_deposit_game UNIQUE (deposit_request_id, game_key),
  CONSTRAINT prize_game_credits_prize_cap CHECK (prize_cents IS NULL OR (prize_cents >= 0 AND prize_cents <= 600))
);
CREATE INDEX IF NOT EXISTS prize_game_credits_available_idx
  ON prize_game_credits (user_id, game_key, id) WHERE redeemed_at IS NULL;
