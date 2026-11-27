-- ════════════════════════════════════════════════════════════════════════════
-- রিবেট (bet rebate) + মিশন (turnover missions)
--
-- Both are paid from REAL turnover: wallet_ledger DEBIT rows joined to
-- games_catalog for the category. Nothing here invents an amount — a category
-- with no bets simply pays 0.00, exactly like the reference screen.
-- ════════════════════════════════════════════════════════════════════════════

-- ── রিবেট ───────────────────────────────────────────────────────────────────
-- One row per player per Dhaka day. `claimed_at` NULL = still claimable.
-- The daily window opens at 00:00 Asia/Dhaka, matching the reference's note
-- "উপরের টোটা GMT + 8 ভিত্তিক".
CREATE TABLE IF NOT EXISTS rebate_days (
  id            SERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rebate_day    DATE        NOT NULL,
  slots_cents   BIGINT      NOT NULL DEFAULT 0,
  live_cents    BIGINT      NOT NULL DEFAULT 0,
  table_cents   BIGINT      NOT NULL DEFAULT 0,
  crash_cents   BIGINT      NOT NULL DEFAULT 0,
  poker_cents   BIGINT      NOT NULL DEFAULT 0,
  other_cents   BIGINT      NOT NULL DEFAULT 0,
  total_cents   BIGINT      NOT NULL DEFAULT 0,
  claimed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rebate_day)
);

CREATE INDEX IF NOT EXISTS rebate_days_user_idx ON rebate_days (user_id, rebate_day DESC);

-- ── মিশন ────────────────────────────────────────────────────────────────────
-- Missions are a fixed catalogue of turnover targets. The player's progress is
-- never stored — it is recomputed from the ledger on every read, so it can
-- never drift from the real bets. What IS stored is the claim itself, one row
-- per (user, mission) with a unique index for idempotency.
CREATE TABLE IF NOT EXISTS missions (
  id          TEXT PRIMARY KEY,          -- 'turnover_1000', 'turnover_3000', …
  title_bn    TEXT        NOT NULL,
  title_en    TEXT        NOT NULL,
  target_cents BIGINT     NOT NULL,      -- qualifying turnover needed
  bonus_cents BIGINT      NOT NULL,      -- paid once on claim
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS mission_claims (
  id          SERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id  TEXT        NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  bonus_cents BIGINT      NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id)
);

-- 26 turnover missions: ৳1,000 → ৳3,000,000. Bonus scales with the target
-- (≈0.2% of turnover, floored to a round number) so the ladder never pays more
-- than the house earns on that turnover.
INSERT INTO missions (id, title_bn, title_en, target_cents, bonus_cents, sort_order) VALUES
  ('turnover_1000',      'প্রতিদিন ৳1,000 বাজি ধরুন',       'Wager ৳1,000',       100000,    100,    1),
  ('turnover_3000',      'প্রতিদিন ৳3,000 বাজি ধরুন',       'Wager ৳3,000',       300000,    200,    2),
  ('turnover_5000',      'প্রতিদিন ৳5,000 বাজি ধরুন',       'Wager ৳5,000',       500000,    500,    3),
  ('turnover_10000',     'প্রতিদিন ৳10,000 বাজি ধরুন',      'Wager ৳10,000',     1000000,   1000,    4),
  ('turnover_20000',     'প্রতিদিন ৳20,000 বাজি ধরুন',      'Wager ৳20,000',     2000000,   2000,    5),
  ('turnover_30000',     'প্রতিদিন ৳30,000 বাজি ধরুন',      'Wager ৳30,000',     3000000,   3000,    6),
  ('turnover_50000',     'প্রতিদিন ৳50,000 বাজি ধরুন',      'Wager ৳50,000',     5000000,   5000,    7),
  ('turnover_80000',     'প্রতিদিন ৳80,000 বাজি ধরুন',      'Wager ৳80,000',     8000000,   8000,    8),
  ('turnover_100000',    'প্রতিদিন ৳1,00,000 বাজি ধরুন',    'Wager ৳1,00,000',  10000000,  10000,    9),
  ('turnover_200000',    'প্রতিদিন ৳2,00,000 বাজি ধরুন',    'Wager ৳2,00,000',  20000000,  20000,   10),
  ('turnover_300000',    'প্রতিদিন ৳3,00,000 বাজি ধরুন',    'Wager ৳3,00,000',  30000000,  30000,   11),
  ('turnover_500000',    'প্রতিদিন ৳5,00,000 বাজি ধরুন',    'Wager ৳5,00,000',  50000000,  50000,   12),
  ('turnover_800000',    'প্রতিদিন ৳8,00,000 বাজি ধরুন',    'Wager ৳8,00,000',  80000000,  80000,   13),
  ('turnover_1000000',   'প্রতিদিন ৳10,00,000 বাজি ধরুন',   'Wager ৳10,00,000',100000000, 100000,   14),
  ('turnover_1500000',   'প্রতিদিন ৳15,00,000 বাজি ধরুন',   'Wager ৳15,00,000',150000000, 150000,   15),
  ('turnover_2000000',   'প্রতিদিন ৳20,00,000 বাজি ধরুন',   'Wager ৳20,00,000',200000000, 200000,   16),
  ('turnover_2500000',   'প্রতিদিন ৳25,00,000 বাজি ধরুন',   'Wager ৳25,00,000',250000000, 250000,   17),
  ('turnover_3000000',   'প্রতিদিন ৳30,00,000 বাজি ধরুন',   'Wager ৳30,00,000',300000000, 300000,   18),
  ('turnover_4000000',   'প্রতিদিন ৳40,00,000 বাজি ধরুন',   'Wager ৳40,00,000',400000000, 400000,   19),
  ('turnover_5000000',   'প্রতিদিন ৳50,00,000 বাজি ধরুন',   'Wager ৳50,00,000',500000000, 500000,   20),
  ('turnover_6000000',   'প্রতিদিন ৳60,00,000 বাজি ধরুন',   'Wager ৳60,00,000',600000000, 600000,   21),
  ('turnover_8000000',   'প্রতিদিন ৳80,00,000 বাজি ধরুন',   'Wager ৳80,00,000',800000000, 800000,   22),
  ('turnover_10000000',  'প্রতিদিন ৳1,00,00,000 বাজি ধরুন', 'Wager ৳1,00,00,000',1000000000,1000000,23),
  ('turnover_15000000',  'প্রতিদিন ৳1,50,00,000 বাজি ধরুন', 'Wager ৳1,50,00,000',1500000000,1500000,24),
  ('turnover_20000000',  'প্রতিদিন ৳2,00,00,000 বাজি ধরুন', 'Wager ৳2,00,00,000',2000000000,2000000,25),
  ('turnover_30000000',  'প্রতিদিন ৳3,00,00,000 বাজি ধরুন', 'Wager ৳3,00,00,000',3000000000,3000000,26)
ON CONFLICT (id) DO NOTHING;

-- Rebate rate, in basis points of turnover (5 = 0.05%). Real setting, not a literal.
INSERT INTO platform_settings (key, value) VALUES
  ('rebate_rate_bps',        '5'),
  ('mission_min_bet_cents',  '1000')
ON CONFLICT (key) DO NOTHING;
