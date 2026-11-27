-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — iGaming Seamless Wallet Schema (PostgreSQL 14+)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  username_or_phone VARCHAR(64)  NOT NULL UNIQUE,
  password_hash     TEXT         NOT NULL,
  email             TEXT,                                 -- legacy/unused; site no longer collects emails (provider gets a deterministic no-reply address at launch)
  phone             VARCHAR(32),                          -- international format, e.g. +8801XXXXXXXXX; required before real-money launch
  balance_cents     BIGINT       NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency          VARCHAR(8)   NOT NULL DEFAULT 'BDT',
  vip_level         INTEGER      NOT NULL DEFAULT 0,
  referral_code     VARCHAR(16)  NOT NULL UNIQUE,
  referred_by       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  is_admin          BOOLEAN      NOT NULL DEFAULT FALSE,   -- extension: gates the in-app admin panel
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                 BIGSERIAL PRIMARY KEY,
  call_id            VARCHAR(128) UNIQUE,                 -- idempotency key from the provider
  user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_code      VARCHAR(32)  NOT NULL DEFAULT 'INTERNAL',
  game_code          VARCHAR(64)  NOT NULL DEFAULT '',
  action_type        VARCHAR(16)  NOT NULL CHECK (action_type IN ('DEBIT','CREDIT','ROLLBACK','DEPOSIT','WITHDRAW','BONUS')),
  tx_subtype         VARCHAR(32)  NOT NULL DEFAULT 'generic',   -- bet | win | bonus_fs | deposit_approved | withdraw_request | …
  amount_cents       BIGINT       NOT NULL,
  balance_before_cents BIGINT     NOT NULL,
  balance_after_cents  BIGINT     NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user    ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS games_catalog (
  id                  BIGSERIAL PRIMARY KEY,
  provider_code       VARCHAR(32)  NOT NULL,               -- JILI | FA_CHAI | SPRIBE | …
  game_code           VARCHAR(64)  NOT NULL UNIQUE,
  title               VARCHAR(128) NOT NULL,
  title_bn            VARCHAR(128) NOT NULL DEFAULT '',
  category            VARCHAR(16)  NOT NULL CHECK (category IN ('SLOTS','LIVE','FISHING','POKER','SPORTS','CRASH','TABLE','INSTANT','BINGO','KENO','VIRTUAL','SPORTSBOOK','OTHER')),
  thumbnail_url       TEXT         NOT NULL DEFAULT '',
  is_favorite_default BOOLEAN      NOT NULL DEFAULT FALSE,
  is_hot              BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order          INTEGER      NOT NULL DEFAULT 100
);
CREATE INDEX IF NOT EXISTS idx_games_category ON games_catalog(category, sort_order);

CREATE TABLE IF NOT EXISTS cashier_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type  VARCHAR(16) NOT NULL CHECK (request_type IN ('DEPOSIT','WITHDRAW')),
  channel       VARCHAR(16) NOT NULL CHECK (channel IN ('bKash','Nagad','Rocket')),
  account_ref   VARCHAR(64) NOT NULL DEFAULT '',
  trx_ref       VARCHAR(64) NOT NULL DEFAULT '',
  amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
  status        VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashier_status ON cashier_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_user   ON cashier_requests(user_id, created_at DESC);
