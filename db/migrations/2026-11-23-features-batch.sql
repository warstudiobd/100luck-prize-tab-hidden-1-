-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — Features batch (2026-11-23, additive only)
--  1) announcements.image_url          — optional picture for an announcement
--  2) site_popups                      — website-open popup (text + picture)
--  3) chat_auto_reply                  — single-row auto-reply config for live chat
--  4) chat_messages.is_auto            — marks agent messages sent by the auto-reply
--  5) deposit_channels.mode/api_*      — deposits can be switched to an API gateway
--  6) idx_wallet_ledger_user_action    — speeds up referral wager sums
--  Referral bonus itself needs no new table — logic changes in code only
--  (৳500 deposit + ৳3000 wager per referee, conditions hidden from players).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS site_popups (
  id          BIGSERIAL PRIMARY KEY,
  title_en    TEXT NOT NULL DEFAULT '',
  title_bn    TEXT NOT NULL DEFAULT '',
  body_en     TEXT NOT NULL DEFAULT '',
  body_bn     TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_popups_active ON site_popups (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_auto_reply (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  body        TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chat_auto_reply (id, is_enabled, body)
VALUES (1, TRUE, 'ধন্যবাদ আপনার মেসেজের জন্য! 🙏 আমরা সাধারণত কয়েক মিনিটের মধ্যে রিপ্লাই দিই (২৪/৭)। ডিপোজিট/উইথড্র সমস্যা হলে TrxID সাথে রাখুন।
Thanks for your message! 🙏 We typically reply within a few minutes (24/7). If it is about a deposit/withdrawal, please keep your TrxID ready.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS mode         VARCHAR(8)  NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','api'));
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS api_provider VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS api_base_url VARCHAR(256) NOT NULL DEFAULT '';
ALTER TABLE deposit_channels ADD COLUMN IF NOT EXISTS api_config   JSONB       NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_action_created ON wallet_ledger (user_id, action_type, created_at);
