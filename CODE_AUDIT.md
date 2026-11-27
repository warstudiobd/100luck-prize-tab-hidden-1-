# Full-code audit — 100LUCK / sonali7-casino

Reviewed: API routes, wallet/bonus/deposit libs, auth, settings, next config, DB schema and live ledger data.
Version audited: v15 (`dpl_S23pVfT1UJMTy4CtpUMfHGHVkpDs`). Items marked ✅ fixed in v16.

---

## 1. Critical — money was leaking

### 1.1 Three daily prizes were free money ✅ fixed in v16
`/api/rewards` (login + egg) and `/api/bonus/spin` paid out on a logged-in session alone.
No deposit, no wager, no play. Expected value per account:

| Prize | EV/day |
| --- | --- |
| Daily login | ৳6.17 |
| Egg smash | ৳13.50 |
| Lucky spin | ৳42.50 |
| **Total** | **৳62.17/day ≈ ৳22,700/year** |

Wallet credits are withdrawable, so 100 throwaway SIMs ≈ ৳2.27M/year of real cash out.
The live DB confirmed organic abuse already happening (`daily_login`, `lucky_spin`,
`egg_smash` credits with no matching bets).

**Fix (v16):** one gate for all three — today's deposits ≥ ৳500 **and** today's wager ≥ 1× today's deposit, checked server-side in the POST handler (403 `gate_locked`), all thresholds in `platform_settings`.

**Fix (v17):** the same leak existed through three more doors — `/api/missions`,
`/api/rebate` and `/api/referral/ladder` paid withdrawable bonus to accounts that
had never deposited once. All three now require one approved deposit ≥ ৳500
(`assertHasDeposited`, 403 `deposit_required`). Screens still load; only the payout is blocked.

### 1.2 VIP level never advanced ✅ fixed in v16
`grep` found no `SET vip_level` anywhere. Every badge on the member centre was a static
number. **Fix:** level is now derived on read from trailing-30-day deposits + wagers
(`/api/vip`), so it rises and falls with real play and cannot drift.

### 1.3 No rate limiting on any endpoint
No `middleware.ts`, no limiter on login/register/rewards. Login is bcrypt-10 with no
lockout, so password spraying and phone-number enumeration are cheap (**user enumeration**
through differing error text is also visible). Recommended: per-IP + per-account token
bucket on `/api/auth/*` (5/min, 20/hour), generic "wrong credentials" message, and a
short lockout after 10 failures.

### 1.4 `SOFTAGG_IP_ALLOWLIST` was unset in code
`ipAllowed()` returns `true` when the variable is empty — fail-open. It *is* set in
production (`85.122.129.59`), but any new environment defaults to open. Preferred:
fail-closed, plus keep the md5/HMAC signature check (already correct).

## 2. Robustness gaps

- **No `app/error.tsx`, `app/not-found.tsx`** — an exception shows Next's default
  screen, which looks like a broken site to a player mid-deposit.
- **No security headers** in `next.config.js` (only `Cache-Control: no-store` on the
  wallet callback). Add `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`,
  `X-Content-Type-Options: nosniff`, HSTS, and a CSP.
- **Demo spin (`/api/games/demo-spin`) is still ungated** — deliberate: it pays play
  money only, not withdrawable balance. Say the word if you want it behind the same gate.
- **Idempotency is good, retries are not:** `wallet_ledger.call_id` is UNIQUE and
  `processWalletAction` locks the row `FOR UPDATE` — correct — but a provider callback
  that times out mid-transaction returns a 500 and the aggregator may retry forever.
  Return 200 + `already_processed` on unique violation instead of an error.

## 3. What is already solid

- Register validates BD phone format, min 6-char password, bcrypt cost 10.
- All three callback paths (`wallet/callback`, `/seamless`, `/webhook`) share one
  handler — no drift between them.
- Every admin mutation re-checks the session per request.
- Ledger-derived balances (no balance column as source of truth for turnover).
- Deposits are the single source of truth for "has paid" (`cashier_requests` +
  `deposit_approved` ledger rows) — the new gate reads that, not a cached flag.

## 4. Suggested next three things, in order

1. **Rate limiting + lockout** on auth (biggest remaining exposure).
2. **`error.tsx` / `not-found.tsx` + security headers** (one small PR, big trust win).
3. **Admin panel for gate + VIP tiers** — right now tuning means a SQL statement; a
   screen lets you raise the ৳500 floor or chest sizes without a deploy.

## 5. Two numbers I still need from you

- What is the **৳2.99** figure on the wheel? (It is in the prize table but no screen
  explains it.)
- The daily-login screen advertises a **৳৯৯,৯৯৯** ceiling (`daily_login_max_prize_cents`
  = 9,999,900). Is that the intended top prize, or a placeholder?
