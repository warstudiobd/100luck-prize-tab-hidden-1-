-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — Withdraw turnover + admin-managed gateways & game providers
--  2026-11-23 (additive only)
--
--  1) platform_settings.key/value   — admin-editable platform switches
--       withdraw_min_turnover_cents = 200000  (৳2,000 flat turnover)
--  2) deposit_channels              — free-form gateways (name/colour removed
--       from the CHECK), so an admin can add ANY payment company, sorted by
--       display_order; logo + payout flag included.
--  3) game_providers                — registry of game companies (FC Gaming,
--       JILI, …) with API base/credentials config + sync settings, plus
--       games_catalog.provider_id link and is_top for the player ordering.
--  Nothing is dropped or renamed: existing bKash/Nagad/Rocket rows and all
--  games keep working exactly as before.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) platform settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(64) PRIMARY KEY,
  value       TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (key, value)
VALUES ('withdraw_min_turnover_cents', '200000')
ON CONFLICT (key) DO NOTHING;

-- ── 2) deposit channels: unlimited gateways ────────────────────────────
ALTER TABLE deposit_channels DROP CONSTRAINT IF EXISTS deposit_channels_channel_check;
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 100;
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS logo_url      TEXT    NOT NULL DEFAULT '';
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS for_payout    BOOLEAN NOT NULL DEFAULT TRUE;

-- existing rows keep their familiar order
UPDATE deposit_channels SET display_order = 10 WHERE channel = 'bKash'  AND display_order = 100;
UPDATE deposit_channels SET display_order = 20 WHERE channel = 'Nagad'  AND display_order = 100;
UPDATE deposit_channels SET display_order = 30 WHERE channel = 'Rocket' AND display_order = 100;

-- ── 3) game providers (aggregator companies) ───────────────────────────
CREATE TABLE IF NOT EXISTS game_providers (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(32)  NOT NULL UNIQUE,   -- JILI, FC_GAMING, …
  name              VARCHAR(80)  NOT NULL,
  logo_url          TEXT         NOT NULL DEFAULT '',
  api_base_url      VARCHAR(256) NOT NULL DEFAULT '',
  api_config        JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- merchant/agent ids, non-secret
  auth_type         VARCHAR(16)  NOT NULL DEFAULT 'hmac',       -- hmac | bearer | basic | query
  sync_path         VARCHAR(128) NOT NULL DEFAULT '',           -- e.g. /games/list
  launch_path       VARCHAR(128) NOT NULL DEFAULT '',           -- e.g. /games/launch
  default_category  VARCHAR(16)  NOT NULL DEFAULT 'SLOTS',
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE games_catalog ADD COLUMN IF NOT EXISTS provider_id BIGINT REFERENCES game_providers(id) ON DELETE SET NULL;
ALTER TABLE games_catalog ADD COLUMN IF NOT EXISTS is_top      BOOLEAN NOT NULL DEFAULT FALSE;

-- Link the providers that already exist in the catalog so nothing is orphaned.
INSERT INTO game_providers (code, name)
SELECT DISTINCT g.provider_code, g.provider_code
FROM games_catalog g
WHERE g.provider_code <> ''
ON CONFLICT (code) DO NOTHING;

UPDATE games_catalog g
   SET provider_id = p.id
  FROM game_providers p
 WHERE p.code = g.provider_code AND g.provider_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_games_catalog_provider ON games_catalog (provider_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_games_catalog_top      ON games_catalog (is_top, is_hot, sort_order);
