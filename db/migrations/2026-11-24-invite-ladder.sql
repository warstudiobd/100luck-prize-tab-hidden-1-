/**
 * v14 — tiered referral ladder ("বৈধ আমন্ত্রণ" / "আমন্ত্রণ পুরস্কার").
 *
 * invite_ladder    — the bonus owed when a player's total VALID referrals reaches
 *                    `referrals`. Seeded with the 499bet ladder (1→৳300 … 100,000→৳30,000,000).
 * invite_ladder_claims — one row per (user, tier) so a tier pays exactly once.
 *
 * Only tiers at or below the player's real referral count are ever paid, and the
 * payout goes through creditBonusInTx so it lands in the ledger like any bonus.
 * Tiers with an absurd ceiling are seeded exactly as the reference shows them;
 * they are unreachable in practice and that is fine — nothing is promised that
 * isn't computable from real referrals.
 */
CREATE TABLE IF NOT EXISTS invite_ladder (
  referrals integer PRIMARY KEY,
  bonus_cents bigint NOT NULL
);

INSERT INTO invite_ladder (referrals, bonus_cents) VALUES
  (1, 30_000), (2, 30_000), (3, 30_000), (4, 30_000), (5, 30_000),
  (10, 150_000), (15, 150_000), (20, 150_000), (30, 300_000), (40, 300_000),
  (50, 300_000), (60, 300_000), (70, 300_000), (80, 300_000), (90, 300_000),
  (100, 300_000),
  (1000, 30_000_000), (10000, 30_000_000), (60000, 30_000_000),
  (70000, 30_000_000), (80000, 30_000_000), (90000, 30_000_000), (100000, 30_000_000)
ON CONFLICT (referrals) DO NOTHING;

CREATE TABLE IF NOT EXISTS invite_ladder_claims (
  id          serial PRIMARY KEY,
  user_id     bigint  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrals   integer NOT NULL REFERENCES invite_ladder(referrals),
  bonus_cents bigint  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, referrals)
);

INSERT INTO platform_settings (key, value) VALUES
  ('invite_income_goal_cents', '30000000'),
  ('invite_referrals_goal', '1000')
ON CONFLICT (key) DO NOTHING;
