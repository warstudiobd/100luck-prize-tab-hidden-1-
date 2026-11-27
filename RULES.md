# 100LUCK — Rules Register

Every rule that governs player money, in one table. **If a number appears in the
UI it must appear here, and it must equal what the server actually charges.**

Single sources of truth:

| What | Where |
|---|---|
| Defaults | `lib/rules.ts` → `RULES` |
| Operator overrides | `platform_settings` table (DB) |
| What the client renders | `GET /api/rules` via `useRules()` |
| Money movement | server routes only — the UI never moves cents |

To change a fee: `UPDATE platform_settings SET value='…' WHERE key='…';` — the UI
picks it up on next load. Update this file in the same commit.

---

## 1. Paid play (real money, charged from balance)

| Thing | Price | Setting key | Status |
|---|---|---|---|
| Lucky spin (bonus wheel) | **৳2.99** | `play_fee_cents` = 299 | ✅ enforced |
| Golden egg (one of 9/day) | **৳2.99** | `play_fee_cents` = 299 | ✅ enforced |
| Festival wheel spin | **৳9.99** | `prize_wheel_fee_cents` = 999 | ✅ enforced |

Charge and prize happen in **one transaction** — if the wallet is short nothing is
written; if the prize insert fails the fee is rolled back with it.

> ⚠️ **Two different wheels.** The ৳2.99 "Lucky Spin" in the rewards area and the
> ৳9.99 "Festival wheel" in Prizes are separate products with separate prices.
> Earlier copy quoted ৳9.99 for the ৳2.99 spin and ৳2.99/৳1,000 for the ৳9.99
> wheel. Both are now driven by `/api/rules`.

## 2. Withdrawal

| Rule | Value | Setting key | Enforced |
|---|---|---|---|
| Minimum per request | **৳500** | `withdraw_min_amount_cents` = 50000 | ✅ server + UI |
| Maximum per request | ৳1,000,000 | `withdraw_max_amount_cents` | ✅ server |
| Turnover required before cashing out | **৳500** | `withdraw_min_turnover_cents` = 50000 | ✅ server |
| Requests per day | 99,999 | `withdraw_daily_limit` | ✅ |
| Withdrawal PIN | 4-digit, locks on repeated failure | — | ✅ |
| Payout speed | **manual**, normally within 30 min of approval | `withdraw_notice` | copy only |
| Auto-payout ceiling | **৳500** | `withdraw_auto_max_cents` = 50000 | ✅ server |

### Auto-payout (PayWise) — decided 2026-11-26

Withdrawals from **৳500 (our minimum) to ৳500** are sent to the player's wallet by PayWise
automatically.
Anything above stays PENDING for admin approval. The ceiling lives in
`withdraw_auto_max_cents`; setting it to `0` turns auto-payout off entirely.

Safe-by-default ordering: the player's balance is debited **before** the payout is
attempted, so a failed payout can never leave money both sent and still in the wallet.

**Why the floor is ৳500 (changed 2026-11-26 from ৳200):** PayWise itself refuses any BDT
payout below ৳500, so a ৳200 request could never be settled on the automated rail — it
would sit PENDING and then fail. Because the floor now equals the ceiling, auto-payout is
effectively all-or-nothing at exactly ৳500; everything larger routes to manual approval.
Per-channel payout minimums were raised to ৳500 in the same change so no channel can
undercut the global floor.
A request is only marked `PAID` after PayWise confirms it. Every other outcome stays
`PENDING` and is visible to the admin with the reason recorded in `trx_ref`.

**Merchant-funding pre-flight.** Before every payout we read PayWise `/balance` and
skip the attempt when the BDT rail cannot fund it — PayWise's own BDT limits are
**min ৳500 / max ৳2,000**, and payouts draw only from *settled* funds. A request that
the rail cannot take stays PENDING with `AUTO-HOLD <reason>` in `trx_ref`, visible to
the admin. Reading the balance is best-effort: if `/balance` is unreachable the payout
is still attempted rather than blocked.

**Payout webhooks.** PayWise sends `withdrawal.completed`, `withdrawal.failed` and
`withdrawal.rejected`. All three are handled *before* deposit crediting, because
`completed` is in the deposit "paid" vocabulary — an unrouted payout callback would
have been credited as a second deposit (free money). `failed`/`rejected` refund the
player exactly once and mark the request REJECTED; a repeated delivery is a no-op.

**Statuses.** `cashier_requests.status` allows `PENDING | APPROVED | REJECTED | PAID`.
`PAID` means the provider accepted the payout; it is never set from the request side.

**Currently blocked:** the live API key answers `403 WITHDRAW_NOT_ENABLED` —
"This API key may not request withdrawals: the account owner or Finance can allow it
on the API Keys page." Deposits work on this key; payouts do not. Auto-payout stays
inert (requests remain PENDING) until PayWise enables it on the key.

Turnover counts **game bets only** — deposits, bonuses and cashier rows are
excluded, so a player can't deposit-and-withdraw without playing.

## 3. Deposit

| Rule | Value | Where |
|---|---|---|
| Min / max per channel (deposit) | **PayWise ৳500–৳25,000** (applies to every wallet category inside it: bKash, Nagad, Upay) · Nagad ৳300 · bKash ৳200 · Upay ৳200 · Rocket ৳100 | `deposit_channels` |
| Min per channel (payout) | **৳500 on every payout channel** — bKash, Nagad, Upay, PayWise | `deposit_channels.min_amount_cents` where `for_payout` |
| Crypto (USDT · BEP20) | **1 USDT** minimum, 100,000 max — deliberately NOT pegged to the ৳500 Taka floor | `CRYPTO_MIN_USDT` in the crypto route |
| Which channels are live | **PayWise only** — bKash/Nagad/Upay/Rocket are `is_active=false` | `deposit_channels` |
| TrxID required | yes, min 4 chars | server |

⚠️ Only one channel is currently switched on. The home page still advertises
bKash/Nagad — see §8.

### Deposit floor vs bonus gate (decided: keep them different)

| Gate | Value |
|---|---|
| Deposit floor (money in) | **৳500** |
| Bonus / rewards unlock | **৳500** lifetime approved deposits |

The floor and the gate are now the SAME number (৳500), so a minimum deposit
automatically unlocks bonuses. (History: the floor was ৳300 briefly on 26 Nov,
which left a gap where a ৳300 deposit was playable but earned nothing; the
operator moved the floor back to ৳500 the same day.) A deposit below ৳500 is
rejected outright, so the gap cannot be reached. This is intentional (operator
decision). The deposit screen states it in-line so the rule is never a surprise.

**How the gate is measured: one deposit, not a total.** The player needs a
*single approved deposit* of ≥ ৳500 (`lib/reward-gate.ts` uses `MAX(amount_cents)`,
not `SUM`). Two ৳300 deposits therefore do **not** unlock bonuses — you need one
৳500 payment. Verified at switch-over: every qualifying account had made a single
৳500 deposit, so nobody lost access.

## 4. Rebate (cashback)

| Rule | Value | Setting key |
|---|---|---|
| Rate | **0.05 %** of turnover (5 bps) | `rebate_rate_bps` = 5 |
| Claim | one per day | code |

## 5. Referral

| Rule | Value | Where |
|---|---|---|
| Inviter bonus | **৳300** | `lib/bonus.ts` `REFERRAL_BONUS_CENTS` |
| Friend must deposit | **৳500** cumulative (approved) | `REFERRAL_DEPOSIT_MIN_CENTS` |
| Friend must wager | **৳3,000** cumulative | `REFERRAL_WAGER_MIN_CENTS` |
| Counting starts | 2026-11-23 00:00 +06 | `REFERRAL_EFFECTIVE_AT` |
| Paid | automatically as bonus balance | server |

Both conditions must clear. "Earn ৳300 when they start playing" was loose copy —
the card now states the real gate.

## 6. VIP

| Rule | Value | Setting key |
|---|---|---|
| Deposit needed to unlock next level | **৳500** | `vip_unlock_deposit_cents` = 50000 |

## 7. Rewards / missions

| Rule | Value | Setting key |
|---|---|---|
| Deposit gate for deposit-based rewards | **৳500** | `reward_deposit_min_cents` = 50000 |
| Wager multiplier on reward balance | **1.00×** | `reward_wager_mult_bps` = 10000 |
| Bonus gate enabled | yes | `bonus_gate_enabled` = 1 |
| Min deposit for bonus | **৳500** | `bonus_min_deposit_cents` = 50000 |
| Daily login max prize | ৳99,999 | `daily_login_max_prize_cents` |
| Red-envelope ticket | 1 per **৳1,000** turnover | `wager_per_ticket_cents` |
| Mission min bet | ৳10 | `mission_min_bet_cents` = 1000 — ⚠️ **never read by code** |

## 8. Claims we cannot currently back

These were/are advertised but have **no code path that pays them**. Do not put
them back until the code exists:

| Claim | Status |
|---|---|
| "10% cashback every Friday, credited Monday" | ⚠️ **no payout code exists** — removed from the announcement bar; still on the promo page and slider |
| "Unlimited cashback, no cap" | ⚠️ same |
| "Sub-agent ladder City 30% / District 40% / Master 50%" | ⚠️ no commission engine |
| "bKash/Nagad deposits" | ⚠️ channels are switched off; only PayWise is live |
| "livechat@100luck.com" | ⚠️ removed — domain not owned by us |
| "License GLH-OCCHKTW" (site footer) | ⚠️ unverified — needs a real licence reference or removal |

## 9. Standing invariants

- Money only moves in server routes, inside a transaction, with a `wallet_ledger` row.
- The UI may **never** invent a price; it renders what `/api/rules` returns.
- A promotion is only "real" when a player can actually collect it.
- bKash / Nagad / Upay are the only rails ever named — and only while active.
