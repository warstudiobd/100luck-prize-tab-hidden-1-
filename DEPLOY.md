# Deploying sonali7-casino to Vercel

Project: `prj_BCrWkMcpt9UZfpKGvYrCrmzA2jPg` (team `team_GldiEwrvr9DJZ5bUd4KPrZMA`)
Production alias: https://sonali7-casino.vercel.app

## Why the old deploys silently did nothing

The `create_deployment` connector uploads a *single* file (`DEPLOY_SOURCE.txt`). Vercel then:

1. detects no `package.json` in the upload → decides there is nothing to install/build,
2. restores the build cache and finishes in ~30 ms with `Build Completed in /vercel/output [30ms]`,
3. serves the previous output — so new code never ships, no matter what `buildCommand` says.

Four project settings each independently block a real build:

| Setting | Bad value | Effect |
|---|---|---|
| `outputDirectory` | `""` | Puts Vercel in no-build mode; **install never runs**. |
| `installCommand` | longer than **256 chars** | Request rejected (`should NOT be longer than 256 characters`). Must stay under 256. |
| build cache | enabled | Restores a poisoned `.vercel/output` and skips install. |
| upload contents | `src/DEPLOY_SOURCE.txt` | Build root becomes `src/`, so an extract into the repo root is invisible to the Next detector. |

## Working settings (currently saved on the project)

```
framework        nextjs
buildCommand     next build
installCommand   curl -sL '<drive-url>' -o /tmp/s.tgz&&tar xzf /tmp/s.tgz&&npm i   (~160 chars)
outputDirectory  .next
env              VERCEL_FORCE_NO_BUILD_CACHE = 1
```

## Deploy steps

1. `npx tsc --noEmit` and `npm run build` locally — both must be clean.
2. Build the tarball from the repo root:

   ```bash
   tar czf /tmp/site.tar.gz --exclude=./.npm --exclude=./.cache --exclude=./.local \
     --exclude=./.config --exclude=./node_modules --exclude=./.next --exclude=./.git \
     --exclude=./admin --exclude=./uploads --exclude=./backups --exclude='./.env*' \
     --exclude='*.png' .
   ```

   Copy it into the workspace first (Drive upload needs a workspace path), upload it with
   `upload_file`, then `make_public`, then **verify** the public URL downloads a valid
   gzip and contains the files you expect:

   ```bash
   curl -sL 'https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t' -o /tmp/n.tgz
   tar xzf /tmp/n.tgz -O ./components/views/MemberView.tsx | grep -c '<something you just changed>'
   ```

3. `update_project` with the new Drive id inside `installCommand` (keep it under 256 chars).
4. `create_deployment` with **one file at the repo root** — `{"file": "DEPLOY_SOURCE.txt", "data": "<marker>"}`.
   Do **not** put it in `src/`.
5. Wait ~170 s, then read `get_deployment_events` and confirm you see **all** of:
   - `VERCEL_FORCE_NO_BUILD_CACHE is set so skipping build cache step.`
   - `Running "install" command: ...`
   - `added NNN packages`
   - `Detected Next.js version: 16.4.6`
   - `✓ Compiled successfully`
   - a route table listing `/api/qr`, `/api/auth/register`, `/api/cashier/*`, …
6. Smoke-test production, then delete the old Drive tarball.

## Post-deploy smoke test

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  'https://sonali7-casino.vercel.app/api/qr?d=test&s=440'          # 200 image/svg+xml
curl -s -o /dev/null -w '%{http_code}\n' https://sonali7-casino.vercel.app/
```

Referral round-trip: register via `POST /api/auth/register` with `{"phone":"01…","password":"…","ref":"DEMO777"}`
and confirm `users.referred_by` points at DEMO777's id.

## Gotchas

- The connector parses any `files[].data` that starts with `{` into an object and the API
  then rejects it (`files[0].data should be string`). Multi-file uploads fail for this reason;
  only single-string payloads work reliably.
- `project_settings` passed per deployment **does** override saved project settings — handy
  for testing a change before committing it to the project.
- Don't screenshot/curse port 3000: casino dev runs on :3100, admin on :5180.
- Playwright chromium lives at
  `~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`,
  driven through `/tmp/qa/node_modules/playwright-core`.

---

# Admin console (sonali7-admin)

Project: `prj_8hDrfGNtQXVJB4SENxlBXL7phLA1` (Vite, output `dist`, alias https://sonali7-admin.vercel.app)

Same recipe as the casino, but the `installCommand` pulls the **admin** tarball:

```
framework        vite
buildCommand     npm run build
installCommand   curl -sL '<drive-url>' -o /tmp/a.tgz&&tar xzf /tmp/a.tgz&&npm i
outputDirectory  dist
```

Package it from `admin/` excluding `node_modules` and `dist`:

```bash
cd admin && tar czf ~/admin-site.tar.gz --exclude=./node_modules --exclude=./dist --exclude=./.git .
```

## Admin auth: 401 vs 403

Admin tokens last **12 hours** (`ADMIN_TOKEN_TTL_SECONDS`). The panel stores the token in
`localStorage` (`100luck_admin_token`).

- **401** = token missing/expired/invalid → the panel must sign in again. `adminFetch` clears
  the token and fires the `100luck:auth-lost` event; `App.tsx` listens and returns to the
  sign-in screen with "Your admin session expired."
- **403** = the token is valid but the account is not an admin (`is_admin = FALSE`) or is
  blocked. Signing in again will not help, so the token is kept and only the error is shown.

Every admin route uses the `resolveAdminResult()` / `adminAuthError()` pair from
`lib/admin-http.ts`. **Never** answer 403 for an expired token — that is what made the panel
show "admin only" forever with no way back to the login screen.

## v11 — deposit cashier rebuilt to the 499bet flow

Source: `DEPLOY_SOURCE.txt` = `deposit-cashier v11`.
Tarball actually deployed: `site11c.tar.gz` → Drive `1sxBbLgDnNJTcML5pzSyhXMWguhaT2Bwl` (216,894 B).
`sit11b`/`site11` were dead ends — see the packaging rule below.

**Packaging rule learned here:** do NOT `--exclude='*.png'` (that drops `public/providers/` logos)
and do NOT exclude `*.js` (that drops `next.config.js` + `postcss.config.js`, and the site then ships
with NO Tailwind CSS at all — it renders unstyled while still returning 200). Exclude by directory
(`public/brand`, `public/thumbs`) and by exact pattern (`qa-*.png`, `*.jpg`) instead, then append the
files you do want (`tar rf … public/providers`).

`components/views/DepositView.tsx` was rewritten top-to-bottom:

1. **Title row** — back · `জমা দিন` · notification bell (counts PENDING deposits) · support
   headset that opens the existing `SupportChat`.
2. **Currency tabs** — BDT active, Crypto marked `SOON` (no crypto gateway exists yet; the tap
   only toasts, it never promises a deposit).
3. **আমানতের মোড** — wallet tiles with the real brand logos in `public/providers/`
   (`bkash.png`, `nagad.png`, `rocket.png`), "সেন্ড মানি" caption, 🔥 on the first tile.
4. **পেমেন্ট চ্যানেল** — `চ্যানেল 01/02/03` range chips + `আরও` → bottom sheet listing every
   channel with copy / use buttons.
5. **জমা পরিমাণ** — amount input, live `সীমা: ৳100 - ৳2,50,000` with an inline red warning when
   out of range, 8 quick amounts, `↑` fills the channel maximum.
6. **Sticky footer** — `জমা / পান / বোনাস` totals from the new `GET /api/cashier/summary`
   (approved DEPOSIT sum, approved WITHDRAW sum, lifetime BONUS credits — all real ledger data,
   `—` if the request fails) + the free-spin wheel shortcut + the gold confirm button.
7. **Step 2** — red “send exactly ৳X or you won't be credited” notice, wallet number with copy,
   `Send Money only` + reference, required TrxID, optional own number, and a 4-step how-to strip.

New API: `app/api/cashier/summary/route.ts` (session-scoped, fails soft to zeros).

Fixed along the way: the tab-change animation was `transform: translateY(6px)` on the element
that wraps every view. A transform makes that element a containing block for `position: fixed`,
so the deposit footer was positioned against a 978 px page instead of the 852 px viewport and sat
on top of the bottom nav. Tab changes now use `.tab-fade` (opacity only). Do not put a transform
back on the `<div key={tab}>` wrapper in `AppShell.tsx`.

## v12 — payout wallets + withdrawal records (499bet cashier, part 2)

Source: `DEPLOY_SOURCE.txt` = `payout-wallets v12`.
Tarball: `site12.tar.gz` → Drive `1RgHBtG5L9456NxUmPlni4UtwCwIQo5Jv` (229,642 B).

### New table (already applied to the production Supabase DB)

`db/migrations/2026-11-24-payout-accounts.sql` → `payout_accounts`
(`id, user_id, channel, account_number, is_primary, created_at`), unique on
`(user_id, channel, account_number)`. Maximum 4 numbers per gateway
(`MAX_ACCOUNTS_PER_CHANNEL` in `app/api/cashier/accounts/route.ts`).
Apply it with plain `node` + `pg` against `DATABASE_URL` — there is no migration runner.

### New API surface

| Route | Purpose |
|---|---|
| `GET /api/cashier/accounts` | bound wallets, **masked** (`01711•••593`), never the full number |
| `POST /api/cashier/accounts` | bind one number for a channel (validates `01[3-9]\d{8}`, channel must exist, `for_payout`) |
| `PATCH /api/cashier/accounts` | promote one binding to primary for its channel |
| `DELETE /api/cashier/accounts?id=` | unbind; refuses to remove the **last** one for a channel |
| `GET /api/cashier/counters` | pending deposits/withdrawals, today's approved withdrawals, `withdraw_daily_limit` |
| `GET /api/cashier/history` | now takes `range=today\|yesterday\|7d` (Asia/Dhaka days) and `status` |

### Hard rules added to `POST /api/cashier/request`

1. **A withdrawal may only be paid to a bound number.** The client sends
   `account_id` (not a number); the route looks the number up in `payout_accounts`
   and 400s with `code:"account_not_bound"` if it is not bound. The full number
   therefore never travels to the browser — only the mask does.
2. **Daily cap** from `platform_settings.withdraw_daily_limit` (default `99999`,
   i.e. unlimited). Counts non-rejected withdrawals for the Asia/Dhaka day and
   answers 429 `code:"daily_limit"` when reached. To set a real cap:
   `INSERT INTO platform_settings (key,value) VALUES ('withdraw_daily_limit','3') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;`

### Screens

- `components/views/WithdrawView.tsx` — rewritten: gateway tabs, "আবদ্ধ <GW> (n/4)"
  gradient wallet cards (`********4593`), red **+** → bind screen, payout-time and
  wallet-verification notices, daily-cap counters, "আপনার ব্যালেন্স রিফ্রেশ করুন",
  turnover bar, amount + confirm, today's list.
- `components/views/WalletBindView.tsx` — ই-ওয়ালেট বাঁধুন: group → wallet type →
  number, bound list with primary star / delete, "just bound" marker.
- `components/views/WithdrawRecordsView.tsx` — উত্তোলন রেকর্ড: আজ / গতকাল / ৭ দিন,
  channel filter, requested-vs-paid totals, per-request card with ref copy.
- Sub-navigation lives in `AppShell` (`cashierPage: "bind" | "records" | null`) and
  resets on tab change.

**Deliberately not copied from 499bet:** its "লেনদেন পাসওয়ার্ড" field on the bind
screen. This platform has no withdrawal password, and collecting one we never
verify would be misleading. Everything else in the reference flow is implemented.

## v13 — পুরস্কার reward centre + বন্ধুদের আমন্ত্রণ জানান

Source: `DEPLOY_SOURCE.txt` = `rewards-invite v13`.
Tarball: `site13.tar.gz` → Drive `11PovbH9y50ObGcyzkRtZopdB_KFKJfZK` (242,921 B).

### New table

`db/migrations/2026-11-24-rewards.sql` → `reward_claims`
(`user_id, kind ('login'|'egg'), claim_day, prize_index, prize_cents`), unique on
`(user_id, kind, claim_day)` so a daily prize can never be paid twice. The same
migration seeds `withdraw_daily_limit = 99999` and `daily_login_max_prize_cents = 9999900`.

### API

| Route | Purpose |
|---|---|
| `GET /api/rewards` | `can_login`, `can_egg`, `ends_at` (next Asia/Dhaka midnight), `daily_login_max_prize_cents`, `egg_count`, `recent` winners (masked, from the BONUS ledger) |
| `POST /api/rewards` | `{kind:"login"}` or `{kind:"egg", egg:1..9}` → weighted server-side prize, `reward_claims` insert + `creditBonusInTx`, 409 `already_claimed` on a repeat |
| `GET /api/referral/summary` | level, referral/qualified counts, আজ/গতকাল/মাস counts, income (BONUS `referral_bonus` sum), records, invited list — all from `users.referred_by` + `bonus_referrals` |

Prize tables live in `app/api/rewards/route.ts`: login ৳2–৳50, eggs ৳3–৳150.
The client reveal is cosmetic; the amount is decided server-side. Nothing is
hard-coded into the UI, and the screen states the platform's daily maximum only.

### Screens

- `components/views/RewardsView.tsx` — modal "পুরস্কার": three chips (🎁 লগইন ·
  🥚 ডিম · 🎡 স্পিন), live countdown to the next Dhaka midnight, gift/egg game,
  claim button, recent-winners list. Reached from the new card at the top of the
  promo tab.
- `components/views/InviteView.tsx` — বন্ধুদের আমন্ত্রণ জানান: four tabs
  (সংক্ষিপ্ত বর্ণনা / আয় / রেকর্ডস / আমন্ত্রিতদের তালিকা), level card, আজ-গতকাল-মাস
  counters, copy + native-share invite link built from the player's `referral_code`.

### Layout gotchas fixed here

- A `position: fixed` modal rendered *inside* `PromoView` escaped to the top of the
  viewport and sat under the app header. The scrim is now `fixed inset-0 z-[75]`
  and the prize overlay is its own `fixed inset-0 z-[80]` layer.
- `InviteView` was first appended below the promo list; it must **replace** the
  promo view (early return in `PromoView`), otherwise the page shows both.

---

# v14 — invitation screen rebuild (do not edit above)

Deployed: `dpl_FpdoSgTVHSgJ7ap1t6Fc59hkQouM` → READY, promoted, alias `sonali7-casino.vercel.app`.
Deployment marker `rewards-invite v14`.

New / changed in this version:

| File | Change |
| --- | --- |
| `db/migrations/2026-11-24-invite-ladder.sql` | `invite_ladder` (23 seeded tiers), `invite_ladder_claims` (unique `(user_id,referrals)`), settings `invite_income_goal_cents=30000000`, `invite_referrals_goal=1000`. Applied to prod before deploy. |
| `app/api/referral/summary/route.ts` | One call feeds all four invite tabs. `records` now merges `bonus_referrals` (per-friend) **and** `invite_ladder_claims` (tier rewards), tagged `source: "friend" | "ladder"`. |
| `app/api/referral/ladder/route.ts` | `POST` pays every unlocked unpaid tier in one tx via `creditBonusInTx` (`subtype: referral_bonus`, `call_id bns_ladder_<user>_<tier>`). Idempotent — a second call returns `tiers_paid: 0`. |
| `components/views/InviteView.tsx` | Four tabs: সংক্ষিপ্ত বর্ণনা / আয় / রেকর্ডস / আমন্ত্রিতদের তালিকা. Income-goal card shows the **target** from settings plus earned-so-far, not just earnings. Records footer `মোট` = sum of visible rows. |
| `lib/bonus.ts` | `BONUS_CREDIT_SQL`; member badges, cashier bonus total and rewards "recent winners" were silently zero because they filtered `action_type='CREDIT'`. |

Tarball: `site14.tar.gz` → Drive `1YwHKzwyZJCcfG0v9DaCJTZL5ubqQ_r_a` (733,232 B, 263 entries).
Build recipe that works: exclude `./image-search`, `./tsconfig.tsbuildinfo` and the root `*.png` QA shots by name
(they are 8 MB of screenshots) but **keep** `--exclude=./public` out of the list — `public/providers` must ship
(verified: 4 `public/providers` entries present in the tarball).

Production check after deploy:
`/api/qr` 200 image/svg+xml · `/` 200 · login 200 · `/api/referral/summary` → 23 ladder tiers,
`records: []`, `goals {income_cents:30000000, referrals:1000}`.

---

# v15 — member centre, রিবেট, মিশন, আমার পুরুষ্কার (do not edit above)

Deployed: `dpl_S23pVfT1UJMTy4CtpUMfHGHVkpDs` → READY, promoted, alias `sonali7-casino.vercel.app`.
Deployment marker `rewards-invite v15`.

| File | Change |
| --- | --- |
| `db/migrations/2026-11-24-rebate-mission.sql` | `rebate_days` (UNIQUE `(user_id, rebate_day)`), `missions` (26 seeded turnover targets), `mission_claims` (UNIQUE `(user_id, mission_id)`), settings `rebate_rate_bps=5`, `mission_min_bet_cents=1000`. Applied to prod **before** deploy. |
| `app/api/rebate/route.ts` | `GET` per-category rebate for a Dhaka day + 30-day history; `POST` pays once via `creditBonusInTx` (`subtype rebate`). |
| `app/api/missions/route.ts` | `GET` 26 missions with real progress from today's DEBIT turnover; `POST` pays a reached mission once (`subtype mission`). |
| `app/api/member/badges/route.ts` | Now returns real `rewards` (unclaimed daily login + egg), `missions` (reached but unclaimed), `rebate`, `spin`. Previously `rewards` counted *claimed* bonuses, which is why the grid showed a stale "1". |
| `app/api/cashier/summary/route.ts` | Added `bonus_count` and `turnover_cents` (lifetime qualifying wagering). |
| `components/views/RebateView.tsx` | আমার বেট রিবেট / রিবেট ইতিহাস tabs, six colour-chipped category rows + মোট, দাবি button, GMT+8 note. |
| `components/views/MissionView.tsx` | Blue hero (real player id + balance), চলমান/শীঘ্রই আসছে/শেষ tabs, headline mission with countdown + `লক্ষ্য n/26`, dashed-rail mission list with per-target progress and দাবি. |
| `components/views/MyRewardsView.tsx` | আমার পুরস্কার hub: profile card, VIP bar on **real wagering** (not balance), দাবি করা / উদ্ধার তহবিল / বন্ধুদের আমন্ত্রণ tiles with real counters. |
| `components/views/MemberView.tsx` | Tiles wired to the new full screens, per-tile real badges, logout confirmation dialog on both member screens. |

**Bugs found and fixed during this build**
- `SUM(-amount_cents)` in the rebate history produced a *negative* turnover (−1940) — DEBIT rows are stored positive. Fixed to `SUM(amount_cents)`.
- The VIP bar divided the wallet balance by the VIP target and read 100% for every player; it now uses lifetime qualifying turnover.
- The logout confirm layer was only rendered in the account screen, so tapping লগআউট on the member-centre home silently did nothing. Now rendered in both.

Verified end-to-end locally with a temporary ৳2,100 real bet: rebate ৳1.05 (slots ৳0.60 + live ৳0.45), mission `turnover_1000` ৳1.00 — both claimed once, both idempotent on retry, unearned mission rejected with `target_not_reached`. All test rows removed afterwards; `demo` back to ৳26,893.00 with only its two genuine bonus credits.

Tarball: `site15.tar.gz` → Drive `1hDMwyq5luasvnEJKN4wwk3DjhsUGNnmG` (748,671 B, 271 entries).

Production check: `/api/rebate` ok, rate 5 bps · `/api/missions` 26 missions, ends_at 2026-11-24T18:00Z · `/api/member/badges` `{spin:1, rewards:0}` · `/api/cashier/summary` bonus ৳23.00 across 2 credits.

---

# v16 — reward gating + VIP weekly chest (do not edit above)

Deployed: `dpl_F3ysXi9ShRsebkyveqrXSd5G96em` → READY, promoted, alias `sonali7-casino.vercel.app`.
Marker `rewards-invite v16`.

## The leak this closed

Login prize, egg smash and lucky spin were claimable by **any logged-in account**
with no deposit and no play. Expected value per account: login ৳6.17 + egg
৳13.50 + spin ৳42.50 = **৳62.17/day ≈ ৳22,700/year**. Because wallet funds are
withdrawable, 100 throwaway numbers could pull ~৳2.2M/year out of the business.

## New rule (one rule, all three prizes)

Today's approved deposits ≥ `reward_deposit_min_cents` (৳500) **AND** today's
qualifying wager ≥ today's deposit × `reward_wager_mult_bps` (1.00×).
Enforced inside the POST handlers (`lib/reward-gate.ts` → `assertCanClaim`), not
just hidden in the UI — a crafted request gets HTTP 403 `gate_locked`.

| File | Change |
| --- | --- |
| `db/migrations/2026-11-24-reward-gate-vip.sql` | `vip_tiers` (10 seeded, 30-day deposit+wager requirements, weekly chest), `vip_chest_claims` (UNIQUE `(user_id, week_start)`), settings `reward_gate_enabled=1`, `reward_deposit_min_cents=50000`, `reward_wager_mult_bps=10000`, `vip_unlock_deposit_cents=50000`. Applied to prod before deploy. |
| `lib/reward-gate.ts` | `getGateConfig` / `getGateState` / `assertCanClaim`. Reads real `cashier_requests` + `wallet_ledger` every call. |
| `app/api/rewards/route.ts` | Gate enforced on POST; GET returns `gate{...}` + `claimed_login/claimed_egg` so locked ≠ claimed. Winners list now one row per player, excluding the viewer. |
| `app/api/bonus/spin/route.ts` | Same gate on the spin. |
| `app/api/vip/route.ts` | `GET` derives the level from trailing-30-day deposits+wagers (never stored, so it self-demotes); `POST` pays the weekly chest once per Sunday-started week. |
| `components/views/RewardsView.tsx` | Gate panel with real progress bars + "লক — ডিপোজিট করলেই চালু". |
| `components/views/VipView.tsx` | নিয়ম screen: badge, 30-day মাসিক bars, বেতন chest with countdown + ৭/৩০ toggle, full ladder with per-tier progress. |

## Verified end to end (local, then prod)

no deposit → 403 `no_deposit` · ৳600 deposit → 403 `wager_short` (needs ৳600) ·
৳600 turn → login ৳12.00 + egg ৳5.00 + spin ৳10.00 all paid, second claim 409 ·
VIP1 reached at ৳500/৳5,000 → chest ৳5.00 paid once, retry `already_claimed`.
All test rows removed; `demo` restored to ৳26,893.00.

Tarball: `site16.tar.gz` → Drive `15OCglihvsdlmE8aanjQ6SdoATYfrdD6-` (760,933 B, 276 entries).

## Tuning without a deploy
```sql
UPDATE platform_settings SET value='0'      WHERE key='reward_gate_enabled';      -- back to ungated
UPDATE platform_settings SET value='100000' WHERE key='reward_deposit_min_cents'; -- ৳1,000
UPDATE platform_settings SET value='5000'   WHERE key='reward_wager_mult_bps';    -- 0.5× wager
UPDATE vip_tiers SET weekly_chest_cents=1000 WHERE level=1;                       -- chest size
```

---

# v17 — "no deposit, no bonus" now covers every bonus (do not edit above)

Deployed: `dpl_Cs52hQBvFArxuAa67Eme8S5vbM5L` → READY, promoted. Marker `rewards-invite v17`.
Drive source: `1DXfvD0AlmEGiR_xAbySMrNaMeXDJ79LU` (764,806 B, 277 entries).

v16 gated the three daily prizes only. Missions, daily rebate and the invite ladder
still paid real, withdrawable bonus to accounts that had never deposited once.
That is the same leak by another door, so it is now closed too.

## Two tiers of gate

| Bonus | Rule | Setting |
| --- | --- | --- |
| Login prize, egg smash, lucky spin | deposited **today** ≥ ৳500 **and** wagered ≥ 1× today's deposit | `reward_gate_enabled`, `reward_deposit_min_cents`, `reward_wager_mult_bps` |
| Mission reward, daily rebate, invite ladder, VIP chest (VIP already needs ৳500) | deposited **once, ever** ≥ ৳500 | `bonus_gate_enabled`, `bonus_min_deposit_cents` |

Why two tiers: a real player should not lose yesterday's rebate because they haven't
topped up this morning, but a registration that never paid anything must not be able
to withdraw a single taka of bonus. Both are enforced on the POST only — GET still
returns 200 so the screens render and the player can see what is waiting for them.

Code: `assertCanClaim` / `assertHasDeposited` in `lib/reward-gate.ts`, called from
`app/api/rewards`, `app/api/bonus/spin`, `app/api/missions`, `app/api/rebate`
(POST only) and `app/api/referral/ladder`.

## Verified in production

| Endpoint | Non-depositor |
| --- | --- |
| POST /api/rewards | 403 `gate_locked` |
| POST /api/bonus/spin | 403 `gate_locked` |
| POST /api/missions | 403 `deposit_required` |
| POST /api/rebate | 403 `deposit_required` |
| POST /api/referral/ladder | 403 `deposit_required` |

A depositor passes all five (missions `unknown_mission`, rebate `nothing_to_claim`,
ladder `tiers_paid 0` — normal business answers). Screens still 200 for everyone.

`UPDATE platform_settings SET value='0' WHERE key='bonus_gate_enabled';` reverts this tier alone.

---

# v18 — dead /login link + honest reward copy (do not edit above)

Deployed: `dpl_5B7z2yxhgndkY7v4STSXxKziQHCi` → READY, promoted. Marker `rewards-invite v18`.
Drive source: `1Ef6vAr8eR0TzL25t49kdLVj17imMMR8E` (766,102 B, 279 entries).

| Bug | Fix |
| --- | --- |
| `/login` returned Next's bare **404 This page could not be found**. The app is a single page and sign-in is an overlay, so that URL was never a real route — but it was shared and bookmarked, and to a player it looks like the site is dead. | `app/login/page.tsx` → 307 redirect to `/?login=1`; `AppShell` opens the sign-in sheet when it sees `login=1` and strips the param. |
| Home slide said **"ডিপোজিট ছাড়াই স্পিন করুন / spin without deposit"**, promo rules said **"no deposit needed"**, spin footer said **"no deposit required"** — all false since v16/v17 and a reason for players to feel cheated after claiming. | Reworded to "unlocked by depositing today" in all three places. |

Verified: `/login` → 307 → `/?login=1` → 200 with the auth sheet open; production HTML no longer
contains "spin without deposit"; gate settings still `reward_gate_enabled=1`,
`bonus_gate_enabled=1`, both thresholds ৳500.

---

# v19 — Hot / Slots are real tabs, homepage opens on Hot (do not edit above)

Deployed: `dpl_33X8Q2HbkGJedkvxoS2UtnVuyvgj` → READY, promoted. Marker `rewards-invite v19`.
Drive source: `1ce0azi_4UCdBPENOH-mlcBPgl0CB_SNF` (767,914 B).

## The bug
The lobby downloaded **300 mixed games** (`/api/games`, no filter) and did all filtering in
the browser. Consequences:
- Tapping **Slots** showed only the slots that happened to be in that 300-game batch — most
  of the 10,482 slots never appeared.
- The **HOT** strip was a 9-tile section inside whatever category was selected, so it was not
  a place you could go.
- Search only searched the downloaded 300.

## The fix — one request per view, server decides
| Tab | Request |
| --- | --- |
| **HOT** (new default tab, first in the rail, with a live count badge) | `/api/games?hot=1` |
| Slots / Live / Crash / … | `/api/games?category=SLOTS` |
| Search | `/api/games?q=aztec` (220 ms debounce, aborts the previous request) |
| Favourites (any category) | `/api/games?codes=a,b,c` |

Also: the old grid stays on screen while a new tab loads (no more skeleton flash), requests
are aborted when the tab changes so a slow reply cannot overwrite a newer one, the API returns
per-category `counts` + `hot_count`, and "All" now means "the whole hot list" instead of
silently jumping back to Slots.

## Verified in production
`?hot=1` → 300 games, 100% `is_hot`, 614 hot total · `?category=SLOTS` → 300 games, 100% SLOTS ·
`?q=aztec` → 51 results · API 0.07 s / 0.18 s / 0.21 s · first tiles painted in 54 ms ·
tab switching fires exactly one request per tap.

---

# v20 — Hot Games tile removed from the top row (do not edit above)

Deployed: `dpl_7inBDFR3EUCExHoFcc4KsuVqZ46f` → READY, promoted. Marker `rewards-invite v20`.
Drive source: `1RH7SWflt7TjcxJSr6tyFapRw5LBajPXd` (1,293,398 B).

The five quick-action tiles (Hot Games / Support / Cashback / Agent / Rewards) became four
(Support / Cashback / Agent / Rewards) in a 4-column row, so they fill the width with no gap.
The tile's `hot` action was dead code once the lobby gained a real HOT tab in v19, so the
handler was removed from `HomeView` too. The HOT tab in the game rail is unchanged (badge 614).

---

# v21 — PayWise Asia payment webhook (do not edit above)

Deployed: `dpl_6JSjSYiPT7e7AE9HQhmeyR8XwNBq` → READY, promoted. Marker `rewards-invite v21`.
Drive source: `1fL5rMVCqyU2jzxjsV2Jp7pHA1bPmxLGV` (773,783 B).

## Endpoint

```
POST https://sonali7-casino.vercel.app/api/payments/paywise/webhook
```

`GET` on the same URL returns a health JSON (`secret_configured: true`) so a human
pasting it in a browser gets an answer instead of 405.

## Signing secret
`PAYWISE_WEBHOOK_SECRET` added in Vercel (type: sensitive, production + preview).
The value is **not** in the repo, the tarball or `DEPLOY.md` — only in Vercel and the
local `.env.local` (git-excluded). Rotate it in Vercel if it was ever pasted in chat.

## Verification
`X-PAYWISE-SIGNATURE` is checked as HMAC-SHA256 of the **raw** body. Four realistic
scheme variants are tried (hex, base64, `sha256=<hex>` prefixed, `t=…,v1=…` style) and
the one that matched is stored in `webhook_events.sig_scheme` — the first real delivery
tells us definitively which PayWise uses, with no guessing afterwards.

## Money path
Paid status → match `cashier_requests.trx_ref` → `applyApprovedDepositTx` inside a
transaction with `FOR UPDATE` on both the request and the user row. The request must
still be `PENDING`, so a retried delivery can never double-credit. Failed / cancelled /
expired status → request set `REJECTED`. Unknown status → stored and ignored.

## New table `webhook_events`
Every delivery stored with raw body, payload JSON, signature verdict, scheme, matched
ref, outcome, HTTP status, amount and IP. Unique `(provider, event_id)` = replay guard.
Applied to the database before deploy.

## Verified
| Case | Result |
| --- | --- |
| valid signature, pending order ৳750 | `200 credited`, ledger `csh_dep_appr_14`, balance +৳750 |
| same delivery replayed | `200 ignored` — no second credit |
| wrong signature | `401 invalid signature`, stored as `bad_signature` |
| valid signature, unknown order | `200 unknown_ref` |
| live production probe | `200 unknown_ref`, scheme `hmac:raw-hex` |

Test rows removed afterwards; `demo` restored to ৳26,893.00.

## Still needed from PayWise
1. The exact field name they use for the merchant order reference (`transaction_id`
   vs `merchant_order_id` vs `reference`) — the handler already accepts all of them.
2. Whether the digest signs the raw body or a canonical string — `sig_scheme` will
   show it on the first real callback.

---

# v22 — PayWise V2 signature (timestamp-bound) · dpl_4pxMc5XhRMV2zuM2bJvuiRv7omW2

Drive source `1-xffgrV45CdNQ-RafwNrkDPlbkP4iMUo` (778,028 B). Marker `rewards-invite v22`.

## Verification order

1. **V2 (preferred)** — `X-PAYWISE-Signature-V2` + `X-PAYWISE-Timestamp`.
   Signed string `${timestamp}.${rawBody}`, HMAC-SHA256 with `PAYWISE_WEBHOOK_SECRET`.
   Timestamp must be within **±300 s** → a captured delivery cannot be replayed later.
   If the V2 header is present but the timestamp is missing/stale, the request is
   **rejected** — there is no silent fallback to V1 (drop-the-timestamp downgrade).
2. **V1 (fallback)** — `X-PAYWISE-SIGNATURE` = HMAC over the raw body. Accepted for
   senders still on V1; it has no replay protection, which is exactly why V2 is preferred.

Both accept hex or base64, bare or `sha256=`-prefixed. The scheme that matched is stored
in `webhook_events.sig_scheme` (`v2:ts.body`, `v1:raw-body`, …).

## Verified (local + production)
| Case | Result |
| --- | --- |
| V2 valid | `200` (`v2:ts.body`) |
| V2 with `sha256=` prefix | `200` |
| V1 valid | `200` (still accepted) |
| V2 timestamp 1–2 h old | `401` — replay window enforced |
| V2 wrong digest | `401` |
| V2 header, no timestamp | `401` |
| Body tampered after signing | `401` |
| No signature at all | `401` |
| V2 paid callback on a PENDING ৳300 order | `200 credited`, balance +৳300 |
| Same delivery re-signed with a fresh timestamp | `200 ignored` — no double credit |

Health endpoint now reports `preferred: "V2 (timestamp-bound)"`.

## Still open
Payment **creation** (initiate) is still not built — the webhook receives, but the site
cannot send a player to PayWise yet. Needs `PW-subscription-key`, api_key, merchant id.

---

# v23 — legacy callback URL no longer rejects PayWise · dpl_GG6TSTEZ2va7NUSdkkQ5wVv3KhvB

PayWise's dashboard was pointed at `/api/deposit/gateway/callback` and the test event
got `503 gateway_not_configured` three times ("Failed (no retries left)"). That URL
authenticates with `DEPOSIT_API_SECRET`, so PayWise signatures could never pass there.

Fix in `app/api/deposit/gateway/callback/route.ts`:

1. **Relays PayWise traffic.** If the request carries `x-paywise-signature` or
   `x-paywise-signature-v2`, the raw body and the signature headers are forwarded
   byte-for-byte to `/api/payments/paywise/webhook` and its status/body are returned.
   The relay never answers 5xx (a retry would replay the same failing hop).
2. **Acks unsigned test events.** When `DEPOSIT_API_SECRET` is unset and the body looks
   like a dashboard test (`webhook.test` / `"reference":"Test"`), it answers
   `200 {"ok":true,"received":"test event","credited":false}` so the retry counter stops.
   Nothing is credited.

## Verified on production
| Case | Result |
| --- | --- |
| OLD url, signed test event | `200 {"ignored":"status WEBHOOK.TEST"}` |
| OLD url, unsigned test event | `200 {"received":"test event","credited":false}` |
| OLD url, signed paid event | `200` (relayed, `unknown_ref` for the fake order) |
| NEW url, signed paid event | `200` |
| NEW url, bad signature | `401` |

The recommended URL is still `/api/payments/paywise/webhook`, but the old one is now
harmless instead of destructive.

---

# v24 — PayWise deposit creation (`/api/payments/paywise/initiate`) · dpl_JA4qiRYXq1Dez9LLKK4ZLNeryG1w

`PAYWISE_API_KEY` stored in Vercel (sensitive, prod+preview), value = the `pw_live_…`
merchant key. Drive source `1VuumqYOsK9HH-4UrawkDIv2ZuN2JcD-o`.

## What the key can and cannot do (probed against api.paywise.co)

| Attempt | Result |
| --- | --- |
| `PW-subscription-key` = `pw_live_…` | `401 PW_SUBSCRIPTION_KEY_INVALID` |
| `PW-subscription-key` = key without the `pw_live_` prefix | `401 PW_SUBSCRIPTION_KEY_INVALID` |
| Same against sandbox host | `401 PW_SUBSCRIPTION_KEY_INVALID` |

So the merchant key is **not** the header credential. PayWise's docs list
`PW-subscription-key` as a separate 32-char **developer key** ("available after portal
registration; production key shared on request"). The merchant key travels in the JSON
body as `api_key`. Both are required.

## Endpoint

```
GET  /api/payments/paywise/initiate   → diagnostics: configured?, missing[]
POST /api/payments/paywise/initiate   { "channel": "bKash", "amount_cents": 50000 }
```

Order of operations: create the PENDING `cashier_requests` row (so `trx_ref` exists
before PayWise can call back) → `POST {base}/payments/request?version=2024-10-01` with
`transaction_request.id = trx_ref`, `payment_channel: payment_link`, urls pointing at the
webhook → return `redirect_url` from `payment_details.payers[0].url`.

On any PayWise rejection the PENDING row is **deleted**, so no phantom orders appear in
player history. Missing credentials → `503 paywise_not_configured` naming the missing var.

## Verified
| Case | Result |
| --- | --- |
| No keys | `503`, `missing: [PAYWISE_API_KEY, PAYWISE_SUBSCRIPTION_KEY]` |
| Merchant key only | `503`, `missing: [PAYWISE_SUBSCRIPTION_KEY]` |
| Invalid subscription key (real PayWise call) | `502 PW_SUBSCRIPTION_KEY_INVALID`, row rolled back |
| Unknown channel | `400` |
| Below channel minimum | `400` |
| Deposit view | now calls `/api/payments/paywise/initiate`, falls back to manual TrxID |

## Blocking item
`PAYWISE_SUBSCRIPTION_KEY` — 32-char developer key from the PayWise portal
(API Keys page or from support). Nothing else is missing.

---

# v25 — PayWise payment option live in the deposit screen · dpl_8c6c5nhE4YvJzKrDtpLtrwuyBsrY

Drive source `1w133m-Fp81_mI6GTM8CbmeQZ4J5-O4Qq`.

## Why this shape
PayWise's gateway refuses `POST /payments/request` for this account
(`PW_SUBSCRIPTION_KEY_MISSING — Missing required header: pw-subscription-key`) and probes
show every path on `api.paywise.co` enforces that header, so no automatic checkout can be
created yet. The merchant `pw_live_` key alone is not that credential.

So the gateway ships in the only mode that works today: a **hosted payment-link** channel
with a reference we control.

## What was added
- `deposit_channels` row `PayWise` — `mode='link'`, display_order 5, payout=false. Being a
  row means admins can switch it off, and the deposit screen renders it like any wallet.
- `POST /api/payments/paywise/intent` — creates a PENDING `cashier_requests` row with a
  short reference `PW-XXXXXX` (alphabet excludes 0/O/1/I so players cannot mistype it).
  Nothing is credited; an intent is not a payment.
- `DepositView` — new `link` mode: step 1 unchanged, step 2 shows *Pay through PayWise*,
  the reference with a copy button, then the TrxID box. Step-1 sections are now wrapped in
  `step === "amount"` so step 2 is not buried under them. Wallet strip colour follows the
  selected channel instead of being hard-coded pink.

## Verified
| Case | Result |
| --- | --- |
| `/api/cashier/channels` | `PayWise link` + bKash/Nagad/Rocket `manual` |
| Intent ৳500 (local + production) | `{ok, trx_ref:"PW-…"}` |
| Below minimum / unauthenticated | `400` / `401` |
| Browser: PayWise tile → Start PayWise payment | reference `PW-8MZJYU` rendered with copy button |
| Signed PayWise callback quoting the reference | `200 credited`, balance +৳500 |
| Same callback replayed | `200 ignored` |
| Production end-to-end | intent `PW-L5AMMY` → callback → `+৳500` |

All QA rows, ledger entries and balances restored.

## Upgrade path (unchanged)
The moment PayWise issues the developer key, set `PAYWISE_SUBSCRIPTION_KEY` and the
already-built `POST /api/payments/paywise/initiate` takes over: switch the PayWise channel
`mode` from `link` to `api` in admin and the player redirects to PayWise checkout instead
of seeing a reference.

---

# v26 — deposit screen: readable tiles, names not "Channel 01", Confirm → payment · dpl_8igQfj8xnFTFVoyDBWxk1xM3tgDA

Drive source `13CxVkKEv0fptSLGhaKjmRVcwoFHQfKu2`.

Fixes from the mobile screenshot:
- Tiles: label 7.5px, name 10px with `break-words` instead of `truncate` — "PayWise" no
  longer renders as "PayWi…". Gateway channels show `Pay online` + a gold `GATEWAY` badge.
- "Payment channel" chips show the channel **name** (PayWise / bKash / Nagad / Rocket)
  instead of "Channel 01/02/03".
- The footer button reads **Continue to payment** on a gateway channel and goes to the
  payment step (PayWise), while wallet channels keep "Confirm deposit".
- Gateway step: gold "You are paying ৳X through PayWise…" notice instead of the red
  "you will NOT be credited" warning, which is for manual sends only.

Verified on production: tiles readable, chips named, button `Continue to payment`,
step 2 header `Pay with PayWise`, reference generated (`PW-WB4FAJ`).

---

# v27 — the payment page now shows where to pay · dpl_4TE3HfV2XrusCALPtYqquqqPMdda

Before this, step 2 said "pay through PayWise" but showed no number and no button — a dead
end for the player. Now the page renders, in order of preference:

1. **`Open PayWise payment page`** button when `api_config.checkout_url` is set (new tab).
2. **QR image** when `api_config.qr_url` is set, 160×160 on white.
3. **`PAY TO · <label>` + account number + Copy** when `account_number` is set.
4. If none of the three exist: a red notice telling the player to use bKash/Nagad/Rocket —
   never a silent dead page.

## Admin
`Channels → <gateway> → Payment page / checkout link` and `QR image URL` are new optional
fields, stored in `deposit_channels.api_config`. Only `checkout_url` and `qr_url` are ever
returned by the public `/api/cashier/channels`; `merchant_id` and anything else stay server-side.

## Verified
| Case | Result |
| --- | --- |
| Number set, no link | `PAY TO · PAYWISE ASIA 01700-000000` + Copy on step 2 (local + production) |
| Nothing set | red "not open yet — use bKash/Nagad/Rocket" notice |
| Reference still issued | `PW-2VBQTL` etc. |

**The number currently stored (`01700-000000`) is placeholder.** Replace it in
Admin → Gateways → PayWise, or send the real number / payment link and QR.

---

# v28 — channel chips removed, gateway redirects by method · dpl_DYNAJb6tf42JdipsTrcvoS7s1PKB

1. **"Payment channel" section deleted** from the deposit screen (the Contact-style chips
   that said Channel 01/02/03). The wallet tiles are the only selector now.
2. **PayWise now hands the player to a gateway for the method they pick.** On the PayWise
   payment step there is a `Pay with` row (bKash / Nagad / Rocket); the gold button becomes
   `Pay with <method> via PayWise` and opens the gateway URL in a new tab.

URL resolution order (`components/views/DepositView.tsx → gatewayHref`):
1. per-method override: `api_config.bkash_url` / `nagad_url` / `rocket_url`
2. template: `api_config.gateway_url` with `{method}` `{amount}` `{ref}` substituted
3. plain link: `api_config.checkout_url`, with `?method=&amount=&ref=` appended
4. none of the above → honest "PayWise checkout is not open yet — use bKash/Nagad/Rocket"

Admin → Gateways → PayWise exposes all four fields.

## Verified on production
```
chips removed: true
bKash  -> https://paywise.asia/pay?method=bkash&amount=300.00&ref=PW-7GK7HB
Nagad  -> https://paywise.asia/pay?method=nagad&amount=300.00&ref=PW-7GK7HB
Rocket -> https://paywise.asia/pay?method=rocket&amount=300.00&ref=PW-7GK7HB
```

**The template currently stored is a demo** (`https://paywise.asia/pay?method=…`). Replace
it in admin with the real PayWise payment link, or the player lands on a 404.

---

# v29 — real PayWise API wired end to end · dpl_FYApy5YHWcZPHGNhaCMa96DZAKq6
## admin21b — deposit options gain "Gateway link" mode · dpl_6mAQVwU25uj65qRBJo1q2Prx5ryn

What was wrong in v28: the "gateway" was a URL template I made up
(`https://paywise.asia/pay?method=…`). It 404s. PayWise has a real API, so the site now
calls it instead of guessing a URL.

### New server code
| File | Role |
|---|---|
| `lib/paywise.ts` | Bearer `pw_live_…` client. `POST /api/v1/transactions`, `GET /transactions/{ref}`, `GET /transactions?merchant_reference=`. BDT rails bKash→`BKASH`, Nagad→`NAGAD`, Upay→`UPAY` (there is **no Rocket rail**). Dead host `api.paywise.co` is mapped to `https://paywise.asia/api/v1`. |
| `app/api/payments/paywise/create/route.ts` | The deposit step. Creates the PENDING row first, then either uses an admin-configured URL or asks PayWise for a transaction and returns its `checkout_url`. On refusal it rolls the row back and returns the real PayWise code + a manual number fallback. |
| `app/api/payments/paywise/status/route.ts` | "I have paid — check status". Looks the transaction up by `merchant_reference`, credits if `paid`, rejects if failed/expired. |
| `lib/credit-pending.ts` | One lock-order-safe credit path shared by the webhook and the status check. |
| `app/api/payments/paywise/webhook/route.ts` | Rewritten for the real payload: join key is **`merchant_reference`** (= our `trx_ref`), status from `data.status` or the `payment.*` event name, sandbox deliveries ignored, never answers 5xx. |
| `app/api/cashier/channels/route.ts` | Reports `methods` per gateway (`method_url` / `template` / `paywise_api`) so the picker never offers a rail PayWise does not have. |

### Webhook contract (verified live against the DB)
```
V2: HMAC-SHA256(secret, `${X-PAYWISE-Timestamp}.${rawBody}`)  ±300s
V1: HMAC-SHA256(secret, rawBody)                              fallback
delivery 1 → 200 credited   balance 2,689,300 → 2,719,300
delivery 2 → 200 already    balance unchanged (idempotent)
bad sig    → 401            nothing moved
```

### Live status of the merchant account (the one thing left)
```
GET  https://paywise.asia/api/v1/balance                      → 200, only USDT exists
POST /api/v1/transactions {LOCAL, BDT, BKASH}                 → 403 PAYMENT_METHOD_NOT_APPROVED
POST … NAGAD / UPAY                                           → 403 PAYMENT_METHOD_NOT_APPROVED
Rocket                                                        → not a PayWise rail at all
```
So the player now sees, on production:
"PayWise has not approved bKash for this account yet — …" plus the live manual number
`01711-000000` with a copy button and the reference. No dead redirect, no invented number.

To switch the gateway on for real, in the **PayWise dashboard**:
1. Payment methods → request **Bangladesh (BDT) · bKash / Nagad / Upay**.
2. Websites & webhook → add `sonali7-casino.vercel.app`, turn on the **hosted payment page**,
   set the webhook URL `https://sonali7-casino.vercel.app/api/payments/paywise/webhook`,
   copy the signing secret into Vercel `PAYWISE_WEBHOOK_SECRET`.
3. Nothing else — the site reads the rest at request time.

### Admin panel
`sonali7-admin.vercel.app` was serving a blank page: the project's build command had been
overwritten with `echo … static`, so every deployment published the un-built `./` folder
(no `/assets/*`). Fixed: `buildCommand = npm run build`, `outputDirectory = dist`,
`index.html` asset URLs are now root-absolute. Deposit Options shows three modes and all
gateway URL fields.

---

# v30 — every screen is its own URL (Back / Forward / link sharing) · dpl_24yZN2m5gHjrP8nvsoX7CbYedN3N

**Symptom the user reported:** "if I go back from any page, previous page or next page not
coming — it comes straight to the home page."

**Cause:** the whole site was one route (`/`) with the screen held in React state and
`?tab=…`. A tab switch pushed nothing onto history, so Back jumped out of the app, and the
tab bar was `<button>`s — not links — so nothing could be shared or opened in a new tab.

### Now
| Screen | URL |
|---|---|
| Lobby / home | `/` |
| Deposit | `/deposit` |
| Promotion | `/promotion` |
| Withdraw | `/withdraw` |
| Bind a wallet | `/withdraw/bind` |
| Withdraw records | `/withdraw/records` |
| Member centre | `/member` |

- `components/AppShell.tsx` takes the screen from `usePathname()` (the page file passes
  `tab=…`, so the server renders the right screen and a reload stays put).
- `components/BottomBar.tsx` renders `<Link href>` for every tab — real anchors,
  `aria-current="page"`, prefetched.
- Back arrows use `router.back()` when the visitor came from inside the site, otherwise
  the screen's parent URL. Never "always home".
- Legacy links keep working: `next.config.js` redirects `/?tab=…`, `/promo` and `/m/*` to
  the new paths.
- Gateway returns land on `/deposit?deposit=…` (the toast lives there), and a returning
  player gets their amount, wallet and reference back on the payment step.

### Verified on production
```
tab links: / /deposit /promotion /withdraw /member
walk home→deposit→promotion→withdraw→member
back x3:  /withdraw → /promotion → /deposit      (not home)
forward:  /promotion
/withdraw/records, /withdraw/bind direct + reload → stays on the same URL
/?tab=member → /member   /m/deposit → /deposit   /promo → /promotion
```

---

# v31 — PayWise subscription key + Checkout wired · dpl_Grvpd9YmAq2KCdBtMvGSKcMpNNvU

`PAYWISE_SUBSCRIPTION_KEY` = `pwsk_prod_…` added to Vercel (`Oks92pExyjjMcXv3`,
production + preview). It was the missing credential the docs require for every call.

`lib/paywise.ts` now has two clients:
- `createCheckoutPaymentLink()` / `getCheckoutStatus()` → `api.paywise.co`,
  `version=2024-10-01`, `payment_channel=payment_link`, `payment_method=wallet`.
  Returns the hosted URL the player pays on. **Tried first** in
  `/api/payments/paywise/create`.
- the existing `paywise.asia/api/v1` client stays as the fallback.

Admin → Deposit Options → PayWise gained **"PayWise payout mobile"** (`api_config.payee_mobile`).
Without it Checkout is skipped (logged, not silent); with it the checkout link is created.

### Live probe with the real key
```
GET  /payments/status               403 PW_MERCHANT_ACCESS_REQUIRED
POST /payments/request  BDT wallet  403 PW_MERCHANT_ACCESS_REQUIRED
POST /payments/request  TTD 5..5000 403 PW_MERCHANT_ACCESS_REQUIRED
POST paywise.asia /transactions     403 PAYMENT_METHOD_NOT_APPROVED
```
Valid key (bad keys give 401), production access not granted yet.

---

# v32 — USDT crypto deposits (real PayWise money) · dpl_Acei8Esn5D5Cxn2NJxSyBma9nGDi

PayWise's live merchant account only has the USDT (BEP20) rail enabled. The deposit screen
now offers it: `app/api/payments/paywise/crypto/route.ts` creates the transaction, the UI
shows PayWise's exact `pay_amount` (fee included) + address + hosted checkout link, and the
existing signed webhook credits the wallet.

Verified on production: create 200 → signed webhook `credited` → retry `already`.

---

# v33 — admin Deposit Options loses the mode picker + API/Merchant/URL fields
`dpl_67yqYUVcpdmgxwDAhDpCDfNA88UT` (tarball `admin-site33.tar.gz`, Drive `1Ub9wWeFrEMPmZdqOxgTE5OQNmjfk8CpZ`)

The per-gateway form no longer asks the operator to choose Manual / API / Gateway-link or to
paste an API base URL, Merchant ID, checkout URL, QR URL, gateway template or four per-method
URLs. A card now shows only: logo, on/off switch, (PayWise: a one-line explanation), account
label + number + reference (manual wallets only), min/max/order, payout toggle, Save/Delete.
The PayWise card writes `mode:"api"`, `api_provider:"paywise"`, `api_base_url:""` and an
`api_config` holding just `checkout_url`/`qr_url`. Old config rows keep working — the player
side still reads `checkout_url`/`qr_url` and the legacy links are simply no longer editable.

### v35 — final admin build
`dpl_GVz6Q8uTFYrLbt6HofexaHNq7PvT` (tarball `admin-site35.tar.gz`, Drive `16DYoNFBygLtUF9-prjDJ6hJoqnjHhjFr`)

Verified live in a browser: Deposit Options shows **no** "Deposit mode" picker, no
"Gateway provider", "API base URL", "Merchant ID / Store ID", "Payment page / checkout link",
"QR image URL", "Gateway URL template" or per-method URL fields. Saving the PayWise card PATCHes
`200` and the row lands as `mode:api, api_provider:paywise, api_base_url:"", api_config:{}`.
Player deposit still 200 and `/api/cashier/channels` unchanged.

---

# v36 — Lucky Spin and Egg Smash are ৳2.99 paid plays · dpl_DNc582ao38kNmUMQyjJuo9uuBPHw

| Before | Now |
|---|---|
| 1 free spin + 1 free egg per player per day | unlimited plays, each costs **৳2.99** from the wallet |
| unlocked only by ৳500 approved deposit + 1× wager today (`lib/reward-gate.ts`) | gate **removed** — the price is the gate |
| spin gifted ৳10–৳1,000 | same prizes, minus the ৳2.99 fee |
| egg gifted ৳3–৳150 | same prizes, minus the ৳2.99 fee |

**Money handling** — fee and prize are one transaction (`chargePlayFeeInTx` + `creditBonusInTx`):
a short wallet returns `402 insufficient_balance` and nothing is written; the fee ledger row is
`DEBIT / PAIDPLAY / lucky_spin_fee|egg_smash_fee`, the prize row is `BONUS / BONUS / lucky_spin|egg_smash`.

**Verified on production**
```
spin: 200  fee 299  prize 2500  →  balance 2,689,300 → 2,691,501
egg : 200  fee 299  prize  800  →  balance            → 2,692,002   (test rows + balance reverted)
```

**Files** — `db/migrations/2026-11-25-reward-fee.sql`, `lib/bonus.ts` (`PLAY_FEE_CENTS`, `getPlayFeeCents`,
`chargePlayFeeInTx`), `app/api/bonus/spin/route.ts`, `app/api/bonus/spin/status/route.ts`,
`app/api/rewards/route.ts`, `app/api/member/badges/route.ts`, `components/bonus/LuckySpin.tsx`,
`components/views/RewardsView.tsx`, `components/views/PromoView.tsx`, `components/home/AnnouncementBar.tsx`,
`components/home/PromoSlider.tsx`.

**Still free:** the daily login bonus (once per Asia/Dhaka day) is untouched.
The fee is a platform setting — `UPDATE platform_settings SET value='299' WHERE key='play_fee_cents'`
changes the price without a deploy; the UI reads it from the server.

---

# v37 — new domain warstudio.site drives the PayWise return + webhook URLs
Casino `dpl_BsJuMpQUgUYxAcpuy9CoBxrciFYq` · Admin `dpl_G7rtuweYcZEBsMcYeRiWpyCmKCSE`

| URL | Value now sent to PayWise |
|---|---|
| Return URL (after payment) | `https://warstudio.site/deposit` |
| Webhook / callback | `https://warstudio.site/api/payments/paywise/webhook` |

- New `lib/site-url.ts` — one resolver (platform setting → env → `https://warstudio.site` → request
  origin). `/api/payments/paywise/{create,crypto,initiate}` all use it; the old code took the request
  origin, which can be a `*.vercel.app` deployment host.
- `platform_settings.site_url` and `paywise_webhook_url` added (migration
  `db/migrations/2026-11-25-site-url.sql`), editable in admin → Settings → **Payment URLs** with copy
  buttons — a future domain change needs no deploy.
- Referral link, provider launch email and game-sync return URL fallbacks moved off the vercel.app host.
- Verified: crypto create + signed webhook on `warstudio.site` → `credited`; PayWise accepts a
  `warstudio.site` return_url (201), which it used to refuse as an unregistered domain.

---

# v38 — admin panel on its own subdomain: admin.warstudio.site

| Thing | Value |
|---|---|
| Admin console | `https://admin.warstudio.site` (also `www.warstudio.site` → site) |
| Player site | `https://warstudio.site` |
| Admin API it talks to | `https://warstudio.site` (the panel's API base, prefilled) |

- `admin.warstudio.site` added to the **sonali7-admin** project (`prj_8hDrfGNtQXVJB4SENxlBXL7phLA1`);
  it is a subdomain of the Vercel-managed zone, so it was verified instantly — no DNS records needed.
- `admin/src/api.ts`: `DEFAULT_API` is now `https://warstudio.site` (was the vercel.app host), so a fresh
  browser with empty localStorage signs in without touching the API-base field.
- Deployed `dpl_FaEMQfJQj9XJMCN1dHtjs41jHG8F`.
- Verified in a browser on the new host: login `200 POST warstudio.site/api/admin/token`, then
  `/api/admin/summary` and `/api/admin/chat/conversations` `200`, Deposit Options renders, footer reads
  `warstudio.site`, no page errors.
- The old `sonali7-admin.vercel.app` keeps working. It stores its token per-origin, so signing in on the
  subdomain once is enough; nothing is shared with the old host.
- CORS stays open on the admin API (`ADMIN_PANEL_ORIGIN` unset → `*`) because the panel is a separate
  origin and uses Bearer tokens. Set that env var to `https://admin.warstudio.site` to lock it down —
  note that would break the old vercel.app panel.

---

## v53 — performance + cleanup deploy

| item | value |
|---|---|
| deployment | `dpl_5Hjjg7vPGJaPT4DHsxji9byWJc7k` (production, READY, aliased `warstudio.site`) |
| source bundle | `site53.tar.gz` — Drive id `1NK-KOLmJu58GjpZT1ucZbvnOHfkL4dgF` (public), 238 files |
| install command | `curl -sL "https://drive.google.com/uc?export=download&id=1NK-KOLmJu58GjpZT1ucZbvnOHfkL4dgF" -o /tmp/site.tar.gz && tar xzf /tmp/site.tar.gz -C . && npm install --no-audit --no-fund` |

What shipped: SaleSmartly plugin deleted from the code, dead files removed (see `PERFORMANCE.md`),
and the lobby/game lag fixed — home now renders 18 tiles / 634 DOM nodes instead of 318 tiles /
4,787 nodes, scrolling holds 60 fps (16.6 ms avg frame, 0 long tasks) under 4× CPU throttle.

Verified on production after alias: 637 DOM nodes, 18 tiles, 19 images, 0 broken, 6 columns and
36 tiles at 1180 px wide, scroll avg 16.6 ms / worst 21.8 ms, 0 long tasks, no third-party request
hosts at all (no salesmartly.com), no console errors, no 4xx/5xx, floating App logo still downloads
`100LUCK-1.0.0.apk` and is present on `/deposit`.

---

## v54 — Member page merged into the Profile tab

| item | value |
|---|---|
| deployment | `dpl_3JmwseyWYvEQkCgz84U1qnUyUEWp` (production, READY, aliased `warstudio.site`) |
| source bundle | `site54.tar.gz` — Drive id `1q7ttWH0FWw4UbOnbGAjyrExDcdnpZs5r` (public), 238 files |
| install command | `curl -sL "https://drive.google.com/uc?export=download&id=1q7ttWH0FWw4UbOnbGAjyrExDcdnpZs5r" -o /tmp/site.tar.gz && tar xzf /tmp/site.tar.gz -C . && npm install --no-audit --no-fund` |

- The fifth tab is now **Profile** / **প্রোফাইল** (`lib/i18n.ts`), route still `/member`.
- `components/views/MemberView.tsx`: the old Member-centre landing page and the separate
  "My Account" screen are **one** page — cream profile card (avatar, VIP chip, phone, joined,
  ID, balance, Deposit / Withdraw / My Card) on top, then the Member Center icon grid, the
  game-launch phone card, VIP progress, Customer service + Log out, the referral link and the
  ledger. The "My Account" tile was removed from the grid (it only reopened a copy of the page).
- No duplicate grids are rendered (verified: exactly one "Member Center" block, 18 tiles).
- Desktop stays wide: card capped at 1000 px and the grid reflows to 9 columns (4 on a phone,
  6 from `sm`).

---

## v57 — the lobby was making the server do 15 s of image work

The player site *felt* slow to load even though the HTML came back in 2–7 ms with a load
average of 0.00. The server was never busy at request time; it was busy re-encoding
artwork. Measured, then fixed.

| | |
|---|---|
| deployment | `dpl_2wgUkaEr1ZxgjyAYJWKm9SJSJeJx` (production, aliased `warstudio.site`) |
| source bundle | `site57.tar.gz` — Drive id `1dfo0Soyx9IkdeNEqPlxxnmcWOyN0qJt` (public), 820 files, 5.18 MB |
| new | `scripts/gen-game-thumbs.js`, `public/thumbs/games/*.webp` (582 files, 4.6 MB) |

### The cause

Every one of the 10,751 games stored a `thumbnail_url` on `cdn.imagesai.org`. That CDN
serves the **full-size cover art — 708,471 bytes on the first tile we measured** — and it
cannot resize: `?w=`, `?width=`, `?x-oss-process=` and path suffixes all return the same
708 KB original, because the files are `cache-control: immutable` and the host is plain
Cloudflare in front of static objects.

So `/_next/image` had to download ~700 KB and run a full PNG/JPEG decode **per tile**:

```
cold transform:  964 ms of CPU per thumbnail
warm:            2 ms
18 tiles in the lobby → ~15 s of server work on a 1-core sandbox
```

On Vercel the `/_next/image` cache is not durable across deployments, so the whole cost
was re-paid after every deploy, on every cold container. That is the "server is loading
too much".

### The fix

`scripts/gen-game-thumbs.js` pre-generates a 160 px WebP (target quality 70) for every
game a player can actually reach — the first 300 of the lobby query plus the first 300 of
each category tab, which is **582 games**, not 10,751. The long tail is left on the CDN.

```
570 built in 45 s, 0 failures
download 94.8 MB  ->  wrote 3.28 MB   (29x smaller)
```

`webp` + `resize` is only 22 ms of that; the download dominates, which is exactly why
doing it once offline beats doing it per request.

The API now rewrites `thumbnail_url` to `/thumbs/games/<game_code>.webp` when a generated
file exists, and `GameCard` sets `unoptimized` for those paths so they come straight off
the static file layer. Anything missing still falls back to the CDN, so a partial run is
always safe. `/thumbs/games/*` is sent `max-age=31536000, immutable`.

Also fixed: `quality={62}` was not in `next.config`'s allowed `qualities`, so the optimiser
answered `"q" parameter (quality) of 62 is not allowed` and Next silently rewrote it to 75.
Now `quality={75}`, so both paths agree.

### Measured result

| | before | after |
|---|---|---|
| `/_next/image` calls on the lobby | 18 | **0** |
| requests to cdn.imagesai.org | 18 (≈700 KB each) | **0** |
| bytes per tile | 13,569 | **2,158** |
| server CPU to render the lobby | ~15 s cold | **~0** |
| long tasks during load (prod) | 60 ms | **none** |

FCP on production is unchanged at ~650 ms — that is `pdx1` edge to `iad1` origin for a
visitor in Bangladesh, a hosting/region question, not a front-end one. The change removes
the server-side work, the cold-cache cliff, and the per-deploy re-encoding.

Run again after a catalog sync: `node scripts/gen-game-thumbs.js` (add `--force` to rebuild).

## v56 — extra assets deleted

Removed every file nothing referenced, verified against the running site.

| | |
|---|---|
| deployment | `dpl_4AmYPjzSettih3fcdpk4yHd8bHCc` (production, aliased `warstudio.site`) |
| source bundle | `site56.tar.gz` — Drive id `1HsZSiaYjjX7O9Qc_Zbn9dAtfNmUHgnIw` (public), 237 files, 1.64 MB |
| was | v55e: 241 files, 2.23 MB |

Deleted, each confirmed unreferenced by grep across `app/ components/ lib/ public/ admin/ scripts/`:

- `app/icon.jpg` — Next.js file-convention icon that generated a `/icon.jpg` route no page linked to
- `public/brand/app/splash-512.png`, `adaptive-foreground-432.png`, `adaptive-background-432.png` — PWA/adaptive icon sources that `manifest.json` and `layout.tsx` never point at
- `image-search/` — 7 downloaded bKash/Nagad/Rocket logo candidates, none matching the icons actually served
- `qa-archive/` (73 MB), `uploads/` (16 MB), every root `qa-*.png` / `prod-*.png` / screenshot, `salesmartly-check.html`, `f49-f52.list`, `pinui.mjs`
- `android/` + `.bubblewrap/` — sandbox Android SDK, 871 MB, rebuildable, never part of the site

**Kept on purpose, do not delete:**

- `public/5d5048869c551a3bff4b3d864e3ae8a3.txt` — the IndexNow key file. Deleting it breaks automated
  Bing/Yandex indexing. It looks unreferenced because the key is only ever used in a POST to
  `api.indexnow.org`, never linked from the site.
- `public/uploads/` is gone, but `chat_messages.image_url` and `announcements.image_url` store chat
  pictures and announcement banners. Checked the database: 0 rows reference `uploads/`, and the chat
  widget stores downscaled `data:image` URIs inline, so nothing broke. **If uploads are ever written
  back to `public/uploads/`, that directory must be recreated.**
- `backups/*.json` — the games-title and Bangla-map snapshots used to rebuild game names.
- `100LUCK-1.0.0.aab`, `android-app/` — the Play bundle deliverable and its build tooling.

Verified after deploy: all 11 pages `200` with 0 broken images, the brand emblem still renders at
96×96 on `/`, `/member`, `/deposit` and `/prizes`, all 4 PWA icons + apple-touch-icon + 4 payment
logos + the APK + `manifest.json` still `200`, and the 4 deleted URLs now correctly `404`.

## v55e — full audit + duplicate removal

Whole-site audit (every page, every API, and the real user flows) plus removal of the one genuine
duplicate found. Behaviour is unchanged; the build is simply smaller.

| | |
|---|---|
| deployment | `dpl_Z3HUsux775nA4GrWv9HBQCgYsK36` (production, aliased `warstudio.site`) |
| source bundle | `site55e.tar.gz` — Drive id `1FcyUeM21BsriHWuZuzML-lGn9exPRycM` (public), 241 files |
| removed | `app/get-app/layout.tsx` — exported a `metadata` title/description that was shadowed by `app/get-app/page.tsx` and never applied |
| kept on purpose | the 3 wallet-callback aliases (documented in `PAYMENT_URLS.md`), the seamless marquee banner loop, the RSC payload copy of the Google verification meta |

Audit result — 11 pages, desktop + mobile: all `200`, no console errors, no failed requests,
no broken images, no horizontal overflow. `/` loads 53 requests, all unique. Real flows verified
end to end: login form → balance (৳ 26,893.00), lobby tile → launch sheet → game in launcher →
back to lobby, deposit channels + amount input, withdraw channels, prize centre, profile grid,
language toggle. 17 legacy LotChat URLs still `308` to `/`, unknown paths still return the branded `404`.

The only console line left is `Permissions policy violation: unload is not allowed in this
document.` — it comes from the third-party game iframe, not from our code (no `unload` handler in
the repo, no `Permissions-Policy` header on our responses). Harmless.

Not changed, worth knowing: 623 of the 10,749 games are flagged `is_hot`, so every visible lobby
tile carries a HOT badge. That is data quality, not a bug — the demo sync path in
`app/api/games/sync/route.ts` sets `is_hot TRUE` for every row.

## v55 — remember-me login + SEO (robots / sitemap / canonical / JSON-LD)

| item | value |
|---|---|
| deployment | `dpl_Z3HUsux775nA4GrWv9HBQCgYsK36` (production, aliased `warstudio.site`; v55e audit build. Earlier: `dpl_Fixf5uCqWpzVYn3U3FHarPxmx6K8`, `dpl_JDR7FQCGvMv47wVLW2PzHpxvNvN7` verification meta, `dpl_EJPh9VtnPLk32nRi3iJr1BeSLhYd`, `dpl_AsugCcsRrAnXcWudZRsj8EoZ2PXv`) |
| source bundle | `site55e.tar.gz` — Drive id `1FcyUeM21BsriHWuZuzML-lGn9exPRycM` (public), 241 files (v55d was `1j-qqm0Yc98JsBfS4Vf8qclb4FimIGT07`, 242 files) |
| install command | `curl -sL "https://drive.google.com/uc?export=download&id=1j-qqm0Yc98JsBfS4Vf8qclb4FimIGT07" -o /tmp/site.tar.gz && tar xzf /tmp/site.tar.gz -C . && npm install --no-audit --no-fund` |

### Remember-me (`lib/auth.ts`, `components/AuthModal.tsx`, both auth routes)
- login modal: ticked checkbox "Remember me" — sends `remember: true|false`.
- ticked → JWT `exp 400d` + cookie `Max-Age 400d`; unticked → `12h`. The flag is inside the
  JWT (`rem`), so the pair can never disagree.
- second cookie `sonali7_last_user` (readable by JS, identity only — never the token or the
  password) prefills the mobile number next visit.
- register always remembers; logout clears the session but keeps the remembered number.
- Verified live on production: `remember:true` → 400.0 days, `remember:false` → 0.5 days, checkbox present and ticked, prefill works, 0 console errors.

### SEO
- `app/robots.ts` → `/robots.txt` (was **404**): allow all, disallow `/api/`, `/member`,
  `/deposit`, `/withdraw`, `/play/`; `Host` + `Sitemap` declared.
- `app/sitemap.ts` → `/sitemap.xml` (was **404**): `/`, `/promotion`, `/prizes`, `/get-app`,
  `/member/support`.
- `app/layout.tsx`: `metadataBase`, `<link rel="canonical">`, Open Graph (`bn_BD` + `en_US`),
  Twitter card, `robots` with `max-image-preview:large`, and JSON-LD `Organization` + `WebSite`.
- Per-page canonical + description on `/promotion`, `/prizes`, `/get-app`, `/deposit`,
  `/withdraw`; `/login` (a redirect) is `noindex`.
- IndexNow key file `public/5d5048869c551a3bff4b3d864e3ae8a3.txt` deployed; 5 URLs submitted
  to `api.indexnow.org` → **202 Accepted**.
- Google's legacy `/ping?sitemap=` endpoint is **retired (404)** and Bing's now returns **410**:
  the only reliable channel is Google Search Console.

### Google Search Console verification — DONE
- Token `QkPI25w0vr2bcTtCSnAiFwFIKcBYX9aTBqo0yB34FW0` is live **twice over**:
  - DNS TXT `warstudio.site` — the record was first added with the token duplicated in one
    value (unmatchable); after correction it is a single clean value, confirmed via Google and
    Cloudflare resolvers;
  - `<meta name="google-site-verification" content="…">` on every route (`app/layout.tsx`
    `metadata.verification.google`), deployed in `dpl_JDR7FQCGvMv47wVLW2PzHpxvNvN7`.
- Either method verifies the property. Next: Search Console → *Sitemaps* → submit
  `https://warstudio.site/sitemap.xml`, then *URL Inspection → Request indexing* for `/`.
3. Expect 1–3 weeks before anything appears; gambling content in BD is subject to Google policy
   limits, so ranking is not guaranteed even with perfect technical SEO.

### The domain's history (important for search)
`warstudio.site` previously hosted **LotChat** (social voice rooms). Bing and DuckDuckGo still
list `warstudio.site/auth/login` with the title "LotChat - Social Voice Rooms" — someone else's
brand ranking for this domain. Google's coverage shows the new site, but the stale entries had
to be retired properly:

- 17 permanent (308) redirects added in `next.config.js` for the previous app's paths —
  `/auth/*`, `/login`, `/register`, `/signin`, `/signup`, `/rooms`, `/voice-room/*`, `/lotchat`,
  `/home`, `/index.html`, `/welcome`, `/about`, `/privacy`, `/terms` → `/` (or `/?login=1`).
  A permanent redirect transfers any inherited signal and makes crawlers replace the old entry
  instead of retrying a 404.
- `app/not-found.tsx` — branded 404 (noindex, links back to lobby/promotions/support) replacing
  Next's bare "This page could not be found".
- Verified on production: `/auth/login`, `/auth/register`, `/rooms`, `/lotchat` → `308 → /`.
- IndexNow resubmitted for the 5 canonical URLs (202 Accepted).

**Search Console follow-up for the stale entries:** *Indexing → Pages → Not indexed*, or
*Removals → New request → Temporarily remove URL* for `https://warstudio.site/auth/login`
(that request is temporary, 6 months, but it hides the old LotChat title while the 308 does the
permanent work).
