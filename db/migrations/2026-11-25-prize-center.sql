/**
 * v51 — পুরস্কার কেন্দ্র (prize centre), the festival promo screen.
 *
 * Everything the promo page shows is a real, server-decided play — nothing on the
 * screen is a decoration that pretends to pay:
 *
 *   prize_tickets   one row per ticket claim / envelope open. kind tells what
 *                   gate was crossed ('missions' | 'deposit' | 'invite' | 'spin')
 *                   and gate_cents is the target the player actually crossed
 *                   (100 | 10000 | 50000). free_used marks the one free claim.
 *   prize_wheel     a paid spin of the festival wheel (৳2.99 like every other
 *                   paid play) — prize_key matches lib/prize-wheel.ts, so the
 *                   slice the wheel stops on is the slice that was paid.
 *   promo_progress  the "প্রতিযোগিতার অগ্রগতি" bar: progress_cents is real
 *                   qualifying turnover for the Asia/Dhaka day, shown against
 *                   promo_daily_target_cents from platform_settings.
 *   lucky_spins gets prize_token so an iPhone slice is never paid twice; the
 *   physical prize is settled by the operator from the pending list.
 */
BEGIN;

CREATE TABLE IF NOT EXISTS prize_tickets (
  id          serial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text   NOT NULL,
  gate_cents  bigint NOT NULL,
  free_used   boolean NOT NULL DEFAULT false,
  prize_index integer,
  prize_cents bigint NOT NULL DEFAULT 0,
  ref_id      bigint,
  claim_day   date   NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One ticket of each kind per Asia/Dhaka day: 'free', 'deposit_<gate>', 'wager_<n>'.
CREATE UNIQUE INDEX IF NOT EXISTS prize_tickets_user_kind_day_uniq
  ON prize_tickets (user_id, kind, claim_day);
CREATE INDEX IF NOT EXISTS prize_tickets_user_idx
  ON prize_tickets (user_id, claim_day DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS prize_tickets_free_idx
  ON prize_tickets (user_id) WHERE free_used;

CREATE TABLE IF NOT EXISTS prize_wheel (
  id          serial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prize_key   text   NOT NULL,
  prize_cents bigint NOT NULL,
  fee_cents   bigint NOT NULL DEFAULT 0,
  physical    boolean NOT NULL DEFAULT false,
  wheel_day   date   NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prize_wheel_user_idx
  ON prize_wheel (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prize_wheel_pending_idx
  ON prize_wheel (wheel_day DESC, created_at DESC) WHERE physical;

CREATE TABLE IF NOT EXISTS promo_progress (
  user_id        bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  progress_cents bigint NOT NULL DEFAULT 0,
  progress_day   date   NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- An iPhone slice must never pay twice.
ALTER TABLE lucky_spins ADD COLUMN IF NOT EXISTS prize_token text;
CREATE UNIQUE INDEX IF NOT EXISTS lucky_spins_prize_token_uniq
  ON lucky_spins (prize_token) WHERE prize_token IS NOT NULL;

INSERT INTO platform_settings (key, value) VALUES
  ('promo_daily_target_cents', '100000'),   -- ৳1,000.00 daily turnover target
  ('prize_wheel_fee_cents',    '999')       -- ৳9.99 per festival-wheel spin
ON CONFLICT (key) DO NOTHING;

COMMIT;
