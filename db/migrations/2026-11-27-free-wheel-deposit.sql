-- Free Lucky Wheel spins: one free spin per newly approved deposit >= ৳500.
-- The deposit approval hook and spin redemption both run in existing DB transactions.
CREATE TABLE IF NOT EXISTS lucky_wheel_credits (
  id                  bigserial PRIMARY KEY,
  user_id             bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deposit_request_id  bigint NOT NULL UNIQUE REFERENCES cashier_requests(id),
  deposit_amount_cents bigint NOT NULL CHECK (deposit_amount_cents >= 50000),
  spin_id             bigint UNIQUE REFERENCES lucky_spins(id),
  awarded_at          timestamptz NOT NULL DEFAULT now(),
  redeemed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS lucky_wheel_credits_available_idx
  ON lucky_wheel_credits (user_id, id) WHERE spin_id IS NULL;
