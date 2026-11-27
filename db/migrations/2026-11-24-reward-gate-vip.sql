-- ════════════════════════════════════════════════════════════════════════════
-- Deposit gating for daily rewards + the VIP weekly chest
--
-- WHY: before this migration the login prize, egg smash and lucky spin were
-- claimable by ANY logged-in account with no deposit and no play. Expected
-- value per account was ~৳62/day (~৳22,700/year) — a farm of 100 throwaway
-- numbers could drain ~৳2.2M/year, and none of it was backed by real deposits.
-- (And funds in this wallet are withdrawable, so this was a real cash leak.)
--
-- NEW RULE (one rule, applies to login prize, egg smash and lucky spin):
--   today's approved deposits ≥ ৳500   AND   today's qualifying wager ≥ 1× today's deposit
-- Both windows are Asia/Dhaka days. Everything is a platform_setting, so the
-- admin can retune it without a deploy.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Reward gate settings ────────────────────────────────────────────────────
INSERT INTO platform_settings (key, value) VALUES
  ('reward_gate_enabled',        '1'),
  ('reward_deposit_min_cents',   '50000'),   -- ৳500 deposited today
  ('reward_wager_mult_bps',      '10000'),   -- 1.00× of today's deposit must be wagered
  ('vip_unlock_deposit_cents',   '50000')    -- ৳500 lifetime deposit to unlock VIP chests
ON CONFLICT (key) DO NOTHING;

-- ── VIP ladder ──────────────────────────────────────────────────────────────
-- Two requirements per level, both on a rolling 30-day window (the reference
-- screen's "মাসিক বাজি" / "মাসিক জমা"). The weekly chest pays once per
-- Sunday->Saturday window, only when the level's requirements are still met.
CREATE TABLE IF NOT EXISTS vip_tiers (
  level                 INT PRIMARY KEY,
  min_deposit_cents     BIGINT NOT NULL,   -- rolling 30-day approved deposits
  min_wager_cents       BIGINT NOT NULL,   -- rolling 30-day qualifying turnover
  weekly_chest_cents    BIGINT NOT NULL,   -- paid once per week
  title_bn              TEXT   NOT NULL DEFAULT '',
  title_en              TEXT   NOT NULL DEFAULT ''
);

INSERT INTO vip_tiers (level, min_deposit_cents, min_wager_cents, weekly_chest_cents, title_bn, title_en) VALUES
  ( 1,    50000,    500000,    500, 'ব্রোঞ্জ',  'Bronze'),
  ( 2,   100000,   1000000,   1000, 'সিলভার',  'Silver'),
  ( 3,   200000,   2500000,   2500, 'গোল্ড',    'Gold'),
  ( 4,   500000,   5000000,   5000, 'প্লাটিনাম','Platinum'),
  ( 5,  1000000,  10000000,  10000, 'ডায়মন্ড', 'Diamond'),
  ( 6,  2000000,  25000000,  25000, 'মাস্টার',  'Master'),
  ( 7,  5000000,  50000000,  50000, 'গ্র্যান্ড', 'Grand'),
  ( 8, 10000000, 100000000, 100000, 'রয়্যাল',   'Royal'),
  ( 9, 20000000, 200000000, 200000, 'ইম্পেরিয়াল','Imperial'),
  (10, 50000000, 500000000, 500000, 'লিজেন্ড',  'Legend')
ON CONFLICT (level) DO NOTHING;

-- ── Weekly chest claims ─────────────────────────────────────────────────────
-- week_start = the Sunday (Asia/Dhaka) that begins the claim window. UNIQUE
-- makes the chest once-per-week even under concurrent taps.
CREATE TABLE IF NOT EXISTS vip_chest_claims (
  id           SERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start   DATE   NOT NULL,
  level        INT    NOT NULL,
  amount_cents BIGINT NOT NULL,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS vip_chest_claims_user_idx ON vip_chest_claims (user_id, week_start DESC);

-- ── "No deposit, no bonus" for every non-daily bonus ─────────────────────────
-- Missions, rebate and the invite ladder pay real bonus balance. A registration
-- that never deposited must not be able to withdraw any of it.
INSERT INTO platform_settings (key, value) VALUES
  ('bonus_gate_enabled', '1'),
  ('bonus_min_deposit_cents', '50000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
