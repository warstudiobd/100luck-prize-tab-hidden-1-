-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — Bonus engine (additive only)
--  Applied to production Supabase (production project)
--  via migration "bonus_engine_2026_11_23" on 2026-11-23.
--  Bonus rules (2026-11-23 spec): NO welcome bonus, NO deposit bonus.
--  Bonus = (1) referral ৳300 on friend's FIRST approved deposit,
--          (2) daily lucky spin (1 free spin per Asia/Dhaka day).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lucky_spins (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spin_day DATE NOT NULL,                 -- Asia/Dhaka calendar day
  prize_key VARCHAR(16) NOT NULL,         -- p10 | p25 | p50 | p100 | p300 | p1000
  prize_cents BIGINT NOT NULL CHECK (prize_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, spin_day)
);
CREATE INDEX IF NOT EXISTS idx_lucky_spins_user_created ON lucky_spins (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bonus_referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  deposit_request_id BIGINT REFERENCES cashier_requests(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),   -- 30000 = ৳300
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonus_referrals_referrer ON bonus_referrals (referrer_id, created_at DESC);
