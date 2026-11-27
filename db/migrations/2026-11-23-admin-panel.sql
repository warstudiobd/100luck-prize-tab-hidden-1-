-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — Admin panel support (additive only)
--  Applied to production Supabase (production project)
--  via migration "admin_panel_2026_11_23" on 2026-11-23.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_games_active ON games_catalog(is_active);

CREATE TABLE IF NOT EXISTS announcements (
  id          BIGSERIAL PRIMARY KEY,
  text_en     TEXT NOT NULL,
  text_bn     TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS complaints (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     VARCHAR(80) NOT NULL,
  message     TEXT NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
  admin_note  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_user   ON complaints(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_channels (
  id                BIGSERIAL PRIMARY KEY,
  channel           VARCHAR(16) NOT NULL UNIQUE CHECK (channel IN ('bKash','Nagad','Rocket')),
  account_label     VARCHAR(32) NOT NULL DEFAULT 'Personal',
  account_number    VARCHAR(32) NOT NULL DEFAULT '',
  reference         VARCHAR(32) NOT NULL DEFAULT '',
  min_amount_cents  BIGINT NOT NULL DEFAULT 10000 CHECK (min_amount_cents > 0),
  max_amount_cents  BIGINT NOT NULL DEFAULT 25000000 CHECK (max_amount_cents >= min_amount_cents),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO deposit_channels (channel, account_label, account_number, reference)
VALUES ('bKash','Personal','01711-000000','SONALI7'),
       ('Nagad','Personal','01911-000000','SONALI7'),
       ('Rocket','Agent','01811-000000-1','SONALI7')
ON CONFLICT (channel) DO NOTHING;
