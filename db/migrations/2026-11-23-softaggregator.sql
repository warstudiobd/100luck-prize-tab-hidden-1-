-- 2026-11-23: SoftAggregator live integration support
-- Adds nullable compliance identity fields to users and widens games_catalog.category
-- to every normalized SoftAggregator game_type used by the lobby (plus legacy poker/sports).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);

ALTER TABLE games_catalog DROP CONSTRAINT IF EXISTS games_catalog_category_check;
ALTER TABLE games_catalog ADD CONSTRAINT games_catalog_category_check
  CHECK (category IN ('SLOTS','LIVE','FISHING','POKER','SPORTS','CRASH','TABLE','INSTANT','BINGO','KENO','VIRTUAL','SPORTSBOOK','OTHER'));

-- Fresh/seed installs should NOT invent compliance identities; collect them in the app instead.
-- UPDATE users SET email = NULL, phone = NULL WHERE username_or_phone IN ('admin','demo');
