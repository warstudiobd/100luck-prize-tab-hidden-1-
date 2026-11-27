/**
 * v36 — Lucky Spin and Egg Smash become paid plays: ৳2.99 per play.
 *
 * Before: one free spin + one free egg per Asia/Dhaka day, locked behind a
 * ৳500 approved-deposit + 1× wager gate (lib/reward-gate.ts).
 * Now:    the gate is gone; the player pays PLAY_FEE_CENTS (299) from their
 *         wallet for each play, any number of times per day.
 *
 * reward_claims keeps its UNIQUE (user_id, kind, claim_day) index only for the
 * still-free daily LOGIN bonus. Egg rows therefore become pay-once rows: the
 * index is replaced by a plain one and the fee is recorded on each row.
 */
ALTER TABLE reward_claims ADD COLUMN IF NOT EXISTS fee_cents BIGINT NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS reward_claims_daily_uniq;
CREATE INDEX IF NOT EXISTS reward_claims_user_kind_idx
  ON reward_claims (user_id, kind, created_at DESC);

-- One spin per play: the day is recorded, but it no longer blocks a second spin.
ALTER TABLE lucky_spins ADD COLUMN IF NOT EXISTS fee_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE lucky_spins DROP CONSTRAINT IF EXISTS lucky_spins_user_id_spin_day_key;

INSERT INTO platform_settings (key, value) VALUES ('play_fee_cents', '299')
ON CONFLICT (key) DO NOTHING;
