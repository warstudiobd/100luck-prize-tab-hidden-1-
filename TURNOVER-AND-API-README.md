# Turnover gate, game-company APIs, unlimited payment gateways

Live on production (2026-11-24):
- casino  https://sonali7-casino.vercel.app  — dpl_GXXZCi34Jf2DdNYwsFTaFo6UkqAw
- admin   https://sonali7-admin.vercel.app   — dpl_8jVBpdGDFcPLo5ZdUZ35b5fp49Rx

## 1. Withdrawal turnover — flat ৳2,000, admin-editable
- Rule stored in `platform_settings.withdraw_min_turnover_cents` (default 200000 = ৳2,000).
- Admin → **Settings & Turnover**: type any amount (or use the ৳500/1k/2k/5k presets), plus an
  optional note shown to players. Set 0 to switch the rule off.
- Enforced **server-side** in `POST /api/cashier/request` (WITHDRAW branch). The screen also gets
  `GET /api/cashier/status` → `{ ok, requirement: { requiredCents, wageredCents, remainingCents, ok, notice } }`
  and disables *Confirm withdrawal* until the requirement is met.
- Turnover counts only real game bets (`wallet_ledger` DEBIT rows where `provider_code` is not
  CASHIER/BONUS). Deposits and bonuses never count.

## 2. Game companies — full live integration from the panel
Admin → **Game APIs**:
- **+ New company** — name, code, API base URL, auth type (HMAC / Bearer / Basic / query token),
  merchant id, currency, secret key, game-list path, launch path, default category, logo.
- Secrets are AES-256-GCM encrypted with the server key, stored in `platform_settings.provider_secrets`
  and never returned by any API (the list only reports SET / ENV / MISSING).
- **Test connection** hits the provider's game-list endpoint with the stored key and shows the HTTP
  status, how many games came back and a sample.
- **Sync games** pulls the catalogue straight into `games_catalog` (field-alias tolerant:
  data/games/list/items, game_code|code|id, game_name|name|title, …), making them live in the
  player lobby immediately; games that vanished upstream are deactivated, never deleted.
- Every company gets its own live seamless-wallet endpoint the moment it is created:
  `POST /api/provider/callback?p=CODE` (balance / debit / credit, HMAC-bearer-basic-query auth,
  timestamp skew check, idempotent `call_id`, standard `{code,message,balance}` reply).
- **Delete** is allowed only for companies with no games and no player transactions; otherwise turn
  it off.

## 3. Top / Down ranking + catalogue view
Admin → **Top / Down Ranking**: leaderboard of all providers over 1/7/30/90/365 days with games,
players, stake, payouts, GGR, margin, profit share, plus **TOP PROVIDER**, **DOWN (WEAKEST)** and
**TOP BY CATEGORY** panels and a per-category catalogue breakdown (slots, fishing, live, …).
Sort by profit, stake, players, games or name. Games page keeps the per-category catalogue with
search/filters.

## 4. Unlimited payment gateways
Admin → **Deposit Options**:
- **+ New gateway** — any payment company, with logo, limits, account details, display order and a
  “allow withdrawals (payout)” switch. No code change, no deploy.
- Each gateway can be Manual (TrxID) or API (auto checkout once gateway keys exist) and can be
  switched off; gateways with history cannot be deleted, only hidden.
- Player Deposit and Withdraw screens read the live list from `/api/cashier/channels` — the hardcoded
  bKash/Nagad/Rocket lists are gone from both the UI and the API.
- Database CHECK constraint on `cashier_requests.channel` was dropped (now 2–16 chars) — this is what
  used to reject any new gateway.

## Migrations applied
- `turnover_providers_2026_11_23` — platform_settings, game_providers, games_catalog.provider_id/is_top,
  deposit_channels extras.
- `open_cashier_channel_check_2026_11_24` — dropped the brand CHECK, added length check.
- `ledger_provider_index_2026_11_24` — leaderboard indexes.
Out-of-repo copies: `db/migrations/2026-11-23-turnover-providers.sql`,
`db/migrations/2026-11-24-open-channels-indexes.sql`.
