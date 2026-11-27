# 🎰 SONALI7 · সোনালী৭ — Mobile-First iGaming Portal

A complete full-stack, mobile-first iGaming web application inspired by South Asian
mobile casino portals — dark matte black `#121212` + metallic gold `#F5B800`, Bengali/English
localization, wired to the **SoftAggregator JSON-RPC / Seamless Wallet API** with a
**PostgreSQL** ledger backend enforcing strict ACID transactions (`BEGIN/COMMIT/ROLLBACK`) and
row-level locking (`SELECT … FOR UPDATE`).

> Stack: **Next.js 14 (App Router) · React · TypeScript · Tailwind CSS · Lucide Icons · PostgreSQL (node-postgres)**

---

## ✨ What's inside

| Area | Details |
|---|---|
| 📱 Mobile shell | `max-w-[480px] mx-auto` viewport, fixed 56px header, fixed 64px bottom tab bar, clean desktop side-frame decor |
| 💰 Header | Logo, formatted ৳ balance, manual refresh, `VIP0` badge, EN/বাং toggle, Login/Register button |
| 📲 `/m/*` routes | 499bet-style aliases: `/m/home` → `/`, `/m/deposit|withdraw|promotion|member` → `/?tab=…` (auto-opened tab) |
| ⬇️ Floating APP button | Triggers PWA install prompt (`beforeinstallprompt`) or shows Add-to-Home-Screen instructions |
| 🪪 User ID | Numeric operator-style ID (`1000000000 + users.id`) shown in the Member profile |
| 📢 Announcement bar | Gold marquee ticker with speaker icon |
| 🎠 Promo slider | Swipeable auto-advancing carousel with dots (Welcome 100%, Friday Cashback, Refer & Earn) |
| ⚡ Quick actions | Hot Games (গরম খেলা) · Support (পরিষেবা) · Cashback (ক্যাশব্যাক) · Agent (এজেন্ট) · Rewards (পুরস্কার) |
| 🎮 Split lobby | 74px left category sidebar (Slots/Live/Fishing/Poker/Sports + bn labels) + provider pills (ALL/JILI/FA_CHAI/SPRIBE); right grid with **My Favorites** (localStorage + default-seeded) and **Hot Games**, 3-column mobile grid, provider badges, heart toggles |
| 🚀 Launcher | `POST /api/games/launch` → full-screen `<iframe>` + floating **← Back to Lobby** (balance auto-refreshes on close) |
| 💳 Cashier | bKash / Nagad / Rocket deposits (TrxID) & withdrawals (account number), ৳200/৳500/৳1,000/৳5,000 quick chips, pending → admin approve/reject, auto-refund on withdrawal rejection, 1x turnover progress |
| 👑 Member | Profile, VIP ladder progress, ledger history, referral link copy (`/?ref=CODE`), **Admin panel** (approve/reject queue + credit test balance) |
| 🎰 Demo slot | `/play/demo` — a working 3-reel slot wired through the **real ledger** (debit → spin → credit) so the whole loop runs without provider credentials |

---

## 🚀 Quick start (local)

```bash
# 1. Install
npm install

# 2. Start PostgreSQL & create the database (Debian/Ubuntu example)
sudo apt-get install postgresql
sudo -u postgres psql -c "CREATE ROLE sonali7 LOGIN PASSWORD 'sonali7_local_dev';"
sudo -u postgres psql -c "CREATE DATABASE sonali7 OWNER sonali7;"

# 3. Apply schema + seed
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
sudo -u postgres psql -d sonali7 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO sonali7;"

# 4. Environment (see below) — defaults in .env.example work locally
cp .env.example .env.local   # then edit values

# 5. Run
npm run dev        # development
npm run build && npm run start   # production
```

**Demo accounts** (seeded):

| Role | Username | Password |
|---|---|---|
| Player | `demo` | `demo1234` |
| Admin (Admin panel in Member tab) | `admin` | `admin1234` |

---

## 🔑 Environment variables (`.env.local`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Local: `postgres://user:pass@localhost:5432/sonali7`. Supabase/Neon/RDS in production. |
| `SOFTAGG_BASE_URL` | Provider JSON-RPC endpoint. Default `https://api.softaggregator.com/api/v1` |
| `SOFTAGG_API_LOGIN` | Operator API login from SoftAggregator backoffice. **Leave empty → DEMO mode** (everything works offline) |
| `SOFTAGG_API_PASSWORD` | Operator API password. **Empty → DEMO mode** |
| `SOFTAGG_SALT_KEY` | Salt for inbound callback signature: `md5(timestamp + SALT)` |
| `SOFTAGG_TIMESTAMP_WINDOW_SECONDS` | Max callback timestamp skew (default `300`) |
| `SOFTAGG_AGENT_ID` | *(Optional, blueprint style)* operator/agent id — enables signed-payload outbound calls |
| `SOFTAGG_SECRET_KEY` | *(Optional, blueprint style)* secret for `md5(sortedQueryString + SECRET)` outbound signatures |
| `SOFTAGG_IP_ALLOWLIST` | *(Production)* comma-separated callback source IPs/CIDRs (`x-forwarded-for` aware); empty = open (dev) |
| `JWT_SECRET` | Long random string signing the `sonali7_token` httpOnly session cookie |
| `ADMIN_USERNAMES` | Comma-separated admin usernames (the seeded `admin` also has `is_admin=true`) |

**Demo mode** (no `SOFTAGG_API_LOGIN`/`SOFTAGG_API_PASSWORD`): the outbound client answers
`getProviderList / getGameList / createPlayer / getGameLaunch / getCreditBalance / getPlayerHistory`
locally, launches route to the in-app demo slot, and the **Sync from SoftAggregator** button
re-seeds the local catalog. Perfect for development & QA.

---

## 🗄️ Database schema (`db/schema.sql`)

```
users            — id, username_or_phone (UNIQUE), password_hash (bcrypt),
                   balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
                   currency DEFAULT 'BDT', vip_level, referral_code UNIQUE, referred_by → users(id),
                   is_admin, created_at
wallet_ledger    — id, call_id VARCHAR UNIQUE  ← idempotency key,
                   user_id → users(id), provider_code, game_code,
                   action_type CHECK IN (DEBIT, CREDIT, ROLLBACK, DEPOSIT, WITHDRAW, BONUS),
                   tx_subtype ('bet','win','bonus_fs','deposit_approved','withdraw_request',…),
                   amount_cents BIGINT, balance_before_cents BIGINT, balance_after_cents BIGINT
games_catalog    — id, provider_code (JILI/FA_CHAI/SPRIBE), game_code UNIQUE,
                   title, title_bn, category CHECK IN (SLOTS,LIVE,FISHING,POKER,SPORTS),
                   thumbnail_url, is_favorite_default, is_hot, sort_order
cashier_requests — id, user_id → users(id), request_type (DEPOSIT/WITHDRAW),
                   channel (bKash/Nagad/Rocket), account_ref, trx_ref,
                   amount_cents BIGINT CHECK > 0, status (PENDING/APPROVED/REJECTED)
```

All money is stored as **integer cents** (`BIGINT`) — never floats.
`wallet_ledger.call_id UNIQUE` is the database-level guarantee against double-processing.

---

## 🔌 SoftAggregator integration

### 1. Register the seamless-wallet callback
In the SoftAggregator backoffice, set your operator callback URL to:

```
https://your-domain.com/api/wallet/callback
```

SoftAggregator will then call **your** endpoint in real time for every bet/win/rollback —
your Postgres `users.balance_cents` is the single source of truth.

### 2. Outbound calls (`lib/softaggregator.ts`)
All outbound calls are HTTP POST JSON to `${SOFTAGG_BASE_URL}` with
`{ api_login, api_password, method, ...params }`:

`getProviderList` · `getGameList` · `createPlayer` · `getGameLaunch` · `getCreditBalance` · `getPlayerHistory`

The response is deep-scanned for the first http(s)/same-origin URL and returned as `launch_url`.

### 3. Inbound callback contract (`POST /api/wallet/callback`)

Request body (field names — **verify against your operator docs, see below**):

```json
{
  "timestamp": "1732291200",
  "sign":      "md5( timestamp + SOFTAGG_SALT_KEY )",
  "action":    "debit",
  "call_id":   "tx-9f2c…",
  "user_id":   "2",
  "amount":    "250.50",
  "rb":        0,
  "provider_code": "JILI",
  "game_code": "jili_super_ace",
  "type":      "bet"
}
```

Behaviour:

1. **Timestamp freshness** — rejected with `code: 2` when skew exceeds `SOFTAGG_TIMESTAMP_WINDOW_SECONDS`.
2. **MD5 signature** — `md5(timestamp + SALT)` compared in constant time (`md5(SALT + timestamp)` tolerated as a fallback during integration). Invalid → `code: 1` (`code_str: INVALID_SIGNATURE`).
   - **IP allowlist** — set `SOFTAGG_IP_ALLOWLIST` to the aggregator's egress IPs; non-matching sources get `code: 401`/`IP_NOT_ALLOWED` (HTTP 200). Checked via first `x-forwarded-for` hop.
   - **String codes** — every response includes `code_str` (`OK`, `INVALID_SIGNATURE`, `USER_NOT_FOUND`, `INSUFFICIENT_BALANCE`, `DUPLICATE_TRANSACTION`-style diagnostics, …) next to the numeric `code` for greppable logs.
3. **Routing on `action` only** — `balance | debit | credit`. Unknown `type` values are **never rejected** (they only label `tx_subtype`).
4. **Idempotency** — `call_id` is checked inside the transaction; a retry returns HTTP 200 with the **stored** `balance_after_cents` and `duplicate: true`. A unique-violation race is also caught and mapped to the duplicate response.
5. **ACID** — `BEGIN → SELECT balance_cents … FOR UPDATE → mutate → INSERT wallet_ledger → COMMIT` (`ROLLBACK` on any error). Concurrent callbacks for the same user serialize on the row lock.
6. **rb=1 rollback semantics** — the inverse of the action's normal effect:
   - `debit` + `rb=1` → **adds** `amount_cents` (voids a prior credit)
   - `credit` + `rb=1` → **subtracts** `amount_cents` (voids a prior debit), floored at the current balance, never negative
   - `credit` + `rb=0` → **always pays**, even with no prior debit (`bonus_fs` free spins / bonus wins)
   - `debit` + `rb=0` → requires sufficient balance, else `code: 4` **with the current balance returned** (SoftAggregator expects the live balance on rejection)

**Response — always HTTP 200** with JSON (SoftAggregator reads the body, not the status):

```json
{ "code": 0, "error": 0, "message": "ok", "call_id": "tx-9f2c…", "balance": 2507450, "currency": "BDT", "duplicate": false }
```

| code/error | Meaning |
|---|---|
| 0 | OK |
| 1 | Invalid signature |
| 2 | Stale/unparseable timestamp |
| 3 | User not found |
| 4 | Insufficient funds (current balance included in body) |
| 5 | Bad payload / missing fields |
| 6 | Internal wallet error |

### Blueprint (signed-payload) mode — `SOFTAGG_AGENT_ID` + `SOFTAGG_SECRET_KEY`
If your operator docs show **signed payloads** instead of `api_login`/`api_password`, leave those EMPTY and set:

```
SOFTAGG_AGENT_ID=your_agent_or_operator_id
SOFTAGG_SECRET_KEY=your_secret_key
```

Outbound calls then POST `{ agent_id, timestamp: <ms>, method, ...params, sign }` where
`sign = md5( keys(sort).map(k => k+"="+v).join("&") + SECRET_KEY )` — the exact sorted-key scheme from the reference
integration. Both credential styles work in `lib/softaggregator.ts → buildOutboundBody()`; whichever is set wins.

**Legacy/alternative webhook mount paths** (same handler re-exported, nothing else changes):
`POST /api/webhook/seamless` · `POST /api/wallet/seamless` · `POST /api/wallet/webhook`

### ⚠️ Field names to verify against YOUR SoftAggregator docs

Operator docs vary between versions — confirm all four before going live:

1. **Idempotency key** — this implementation reads `call_id`, falling back to `transaction_id`, `tx_id`, `trans_id`.
2. **User reference** — reads `user_id` (numeric `users.id`), falling back to `player_id`, `username`, `player`, `uid`; non-numeric values resolve via `username_or_phone`. If SoftAggregator uses an *external* player id you create via `createPlayer`, add a mapping column (`provider_player_id TEXT UNIQUE`) and resolve it in `lib/wallet.ts → resolveUserId()`.
3. **Currency unit scaling** — this implementation accepts `amount_cents` (integer cents, authoritative) **or** `amount` (decimal taka, ×100). If your panel sends integer taka or 4-dp decimals, adjust `toCents()` in `lib/wallet.ts` in one place. `balance` is returned in **cents** — change `app/api/wallet/callback/route.ts` if your panel expects taka.
4. **Signature envelope** — some panels sign `md5(salt + timestamp)` (we tolerate it) or send `signature` instead of `sign` (also tolerated). Lock it to the exact documented variant once confirmed.

If anything differs, the only file to touch is **`app/api/wallet/callback/route.ts`** (field extraction + signature) and **`lib/wallet.ts`** (scaling/resolution) — everything downstream stays unchanged.

---

## 🧪 Testing the callback (curl)

```bash
SALT="local_dev_salt_change_me"           # = SOFTAGG_SALT_KEY
TS=$(date +%s)
SIGN=$(printf "%s%s" "$TS" "$SALT" | md5sum | cut -d' ' -f1)

# balance
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"balance\",\"user_id\":\"2\"}"

# debit 25.50  (bet)
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"debit\",\"call_id\":\"bet-001\",\"user_id\":\"2\",\"amount\":\"25.50\",\"provider_code\":\"JILI\",\"game_code\":\"jili_super_ace\",\"type\":\"bet\"}"

# retry the same call_id → identical balance, duplicate:true, NO double-debit
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"debit\",\"call_id\":\"bet-001\",\"user_id\":\"2\",\"amount\":\"25.50\",\"type\":\"bet\"}"

# credit 100.00  (win)
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"credit\",\"call_id\":\"win-001\",\"user_id\":\"2\",\"amount\":\"100\",\"type\":\"win\"}"

# rollback of a credit  (credit rb=1 → subtract, floored at 0)
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"credit\",\"call_id\":\"rb-001\",\"user_id\":\"2\",\"amount\":\"40\",\"rb\":1,\"type\":\"rollback\"}"

# insufficient funds → code:4 + current balance (HTTP 200)
curl -s -X POST http://localhost:3000/api/wallet/callback -H 'content-type: application/json' \
  -d "{\"timestamp\":\"$TS\",\"sign\":\"$SIGN\",\"action\":\"debit\",\"call_id\":\"bet-002\",\"user_id\":\"2\",\"amount\":\"99999999\"}"
```

A scripted end-to-end suite (auth → callback → idempotency → rb → cashier approve/reject → demo spin → register) lives at
**`scripts/e2e-test.mjs`** — `node scripts/e2e-test.mjs`.

---

## 🧑‍💼 Cashier & Admin flows

- `POST /api/cashier/request` — creates a `PENDING` request.
  - **Deposit** → no balance change; TrxID mandatory.
  - **Withdraw** → balance debited **immediately** (funds held, ledger `WITHDRAW/withdraw_request`).
- `POST /api/cashier/decision` — admin-only; row-locks the request (`FOR UPDATE`):
  - `DEPOSIT + APPROVE` → credit (idempotent call_id `csh_dep_appr_<id>`) · `DEPOSIT + REJECT` → no funds move
  - `WITHDRAW + APPROVE` → marked APPROVED (funds already held) · `WITHDRAW + REJECT` → **auto-refund** (idempotent `csh_wd_refund_<id>`)
  - Double-processing is impossible: non-`PENDING` decisions return HTTP 409.
- `GET /api/admin/pending` — pending queue + counts (admin only).
- `POST /api/admin/credit` — credit test balance to any user (`BONUS/admin_test_credit` ledger row).

---

## 📁 Project structure

```
db/schema.sql, db/seed.sql      # PostgreSQL DDL + seed (17 games, demo/admin users)
lib/
  db.ts                         # pg Pool + withTransaction (BEGIN/COMMIT/ROLLBACK)
  wallet.ts                     # ⭐ ACID seamless-wallet core (FOR UPDATE, idempotency)
  softaggregator.ts             # JSON-RPC client + DEMO fallback + launch-URL discovery
  auth.ts                       # JWT session cookie + bcrypt helpers
  i18n.ts / types.ts / format.ts
components/
  AppShell.tsx  Header.tsx  BottomBar.tsx  AuthModal.tsx  Launcher.tsx  Toast.tsx  lang.tsx
  home/  (AnnouncementBar, PromoSlider, QuickActions, GameLobby, HomeView)
  views/ (DepositView, WithdrawView, PromoView, MemberView+Admin)
app/
  page.tsx  layout.tsx  globals.css  manifest.json
  play/demo/page.tsx            # in-app demo slot (real ledger bet/win)
  api/auth/{register,login,logout,me}/route.ts
  api/wallet/{callback,balance,ledger}/route.ts
  api/games/{route.ts, launch, sync, demo-spin}/route.ts
  api/cashier/{request,decision,history}/route.ts
  api/admin/{pending,credit}/route.ts
scripts/e2e-test.mjs            # curl-equivalent E2E suite
```

---

## ☁️ Deploying (Vercel + managed Postgres)

1. Create a Postgres database (Supabase → Project Settings → Connection string → `URI`, or Neon/RDS). Use the pooled/serverless connection string if offered.
2. Run `psql $DATABASE_URL -f db/schema.sql -f db/seed.sql`.
3. Import this repo in Vercel (framework: **Next.js**).
4. Add all env vars (`DATABASE_URL`, `SOFTAGG_*`, `JWT_SECRET`, `ADMIN_USERNAMES`) for Production/Preview.
5. Deploy, then set the SoftAggregator backoffice callback to `https://<your-domain>/api/wallet/callback`.
6. Smoke-test: login `admin/admin1234`, deposit ৳500 as `demo`, approve it in the Member → Admin tab, play the demo slot, verify the ledger.

## 🔒 Security notes

- httpOnly + SameSite=Lax session cookie; bcrypt password hashing; `CHECK (balance_cents >= 0)` at the DB level.
- Callbacks are never trusted: signature + freshness + idempotency + row locking. Integration-test against a staging panel before real money.
- `.env.local` is gitignored. **Rotate `SOFTAGG_SALT_KEY` / `JWT_SECRET` for production** and never commit real operator credentials.
- This build ships demo credentials and a seeded admin — **change/disable them before going live**.
- iGaming is regulated: this codebase is the technical foundation, not legal authorization. Licensing, KYC/AML, responsible-gaming tooling and jurisdiction compliance are your responsibility.

## 📝 Notes & assumptions

- Amounts flow as **integer cents** end-to-end; the UI formats with ৳ and en-IN (lakh) grouping.
- Turnover rule on the Withdraw screen is a demo **1× of approved deposits**; tune in `components/views/WithdrawView.tsx`.
- VIP progression is illustrative (`VIP n→n+1` = `n×৳1,000` wagered).
- The demo slot uses ~91% RTP weights for entertainment; it is **not** a certified game.
- Favorites persist in `localStorage` (`sonali7_favs`).
