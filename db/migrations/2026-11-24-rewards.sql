/**
 * v13 — daily reward center (login bonus + egg smash) and two platform settings.
 *
 * reward_claims keeps one row per (user, kind, claim_day) so a daily prize can
 * never be paid twice, even with concurrent requests. `prize_index` records which
 * egg the player cracked; the prize itself lives in prize_cents.
 *
 * Both daily-limit settings default to "unlimited" (99999) exactly like the real
 * 499bet screens show — we never print a limit the operator has not chosen.
 */
CREATE TABLE IF NOT EXISTS reward_claims (
  id          serial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text   NOT NULL,                 -- 'login' | 'egg'
  claim_day   date   NOT NULL,                 -- Asia/Dhaka calendar day
  prize_index integer,                         -- egg number (1..9), null for login
  prize_cents bigint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_claims_daily_uniq
  ON reward_claims (user_id, kind, claim_day);

CREATE INDEX IF NOT EXISTS reward_claims_user_idx
  ON reward_claims (user_id, kind, created_at DESC);

INSERT INTO platform_settings (key, value) VALUES
  ('withdraw_daily_limit', '99999'),
  ('daily_login_max_prize_cents', '9999900')
ON CONFLICT (key) DO NOTHING;
