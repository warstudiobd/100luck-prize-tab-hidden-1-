# পুরস্কার কেন্দ্র (Prize centre) — v51

Live: **https://warstudio.site/prizes** · wheel `/prizes/spin` · red envelope
`/prizes/envelope` · golden egg + মেইল `/prizes/egg`.
The floating prize dock rides on every other player screen.

Everything on the screens is a real server-decided play. There are no fake
players, no invented numbers, and no "wins" that do not appear in the ledger.

## What the player can do, and what it costs

| Screen | Action | Price / gate | What lands in the wallet |
|---|---|---|---|
| লাকি স্পিন | one wheel turn | **৳9.99** from balance | the slice you land on, credited as BONUS |
| লাল খাম | free ticket | one per day, free | ৳0.50 / ৳1 / ৳2 chip |
| লাল খাম | turnover ticket | per ৳1,000 of the day's real bets (max 26/day) | ৳1 / ৳2 / ৳5 chip |
| লাল খাম | deposit step | ৳100 / ৳1,000 / ৳5,000 approved deposits today, once each | ৳1–৳5 / ৳2–৳10 / ৳5–৳25 chip |
| গোল্ডেন এগ | one egg | **৳2.99** from balance | ৳3 – ৳150 prize |
| মেইল | iPhone list | — | physical prize, no cash |

Both paid plays (wheel, egg) take the fee **and** pay the prize inside one
transaction, so a short wallet changes nothing at all.

## The wheel's odds (server-side, crypto random)

| Slice | Chance | Slice | Chance |
|---|---|---|---|
| ৳6 | 97.96 % | ৳666.66 | 1 in ~5,000 |
| ৳19 | 1 in 67 | ৳666 | 1 in ~3,330 |
| ৳39 | 1 in 333 | ৳9,999 | 1 in ~50,000 |
| ৳99 | 1 in 999 | iPhone Duo | 1 in ~20,000 |

Expected payout ≈ **৳6.92 a spin**, which is why a spin costs ৳9.99 and not the
৳2.99 the eggs use — at ৳2.99 the wheel would return 231 % and lose money on
every turn. At ৳9.99 it returns ≈ 69 %.

**Do not lower `prize_wheel_fee_cents` without re-checking that maths** — the
weights live in `lib/prize-wheel.ts`, the fee is a platform setting.

## Operator settings

```sql
-- wheel price (paisa); default 999 = ৳9.99
UPDATE platform_settings SET value = '999'  WHERE key = 'prize_wheel_fee_cents';
-- daily turnover target shown by the progress bar; default 100000 = ৳1,000
UPDATE platform_settings SET value = '100000' WHERE key = 'promo_daily_target_cents';
```

## iPhone wins — the operator must hand it over

An iPhone cannot be paid into a wallet, so a win credits **nothing**: it is
recorded in `prize_wheel(physical = true)`, listed on the winners board with a
masked name (`017***3`), and queued for the operator.

```bash
# token
TOKEN=$(curl -s https://warstudio.site/api/admin/token -H 'content-type: application/json' \
  -d '{"username_or_phone":"Bdritu","password":"<admin password>"}' | jq -r .token)

# who is waiting for a phone
curl -s https://warstudio.site/api/admin/prizes -H "authorization: Bearer $TOKEN" | jq

# close one out (records the decision; never touches a wallet)
curl -s https://warstudio.site/api/admin/prizes -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"id":41,"action":"settle","note":"handed over"}'
```

`action` is `settle` (delivered) or `void` (fraudulent). A settled prize leaves
the queue, so the same phone can never be handed out twice.

## Data (migration `db/migrations/2026-11-25-prize-center.sql`, applied live)

* `prize_tickets` — one row per ticket: `kind` = `free` | `wager_<n>` | `deposit_<gate>`,
  unique per (user, kind, day).
* `prize_wheel` — one row per wheel turn; `physical = true` is the iPhone queue.
* `promo_progress` — reserved for per-player promo progress.
* `lucky_spins.prize_token` — UNIQUE; guarantees a physical win can never be
  recorded twice.

## Routes added

```
GET  /api/prizes               public board + the player's own numbers
POST /api/prizes/ticket        { kind: "free" | "wager" | "deposit", gate }
GET  /api/prizes/ticket        how many tickets are still available today
POST /api/prizes/spin          one ৳9.99 wheel turn
GET  /api/admin/prizes         iPhone queue + today's wheel/ticket totals (Bearer)
POST /api/admin/prizes         { id, action: "settle" | "void" }
```

Screens: `components/prizes/{PrizeHub,PrizeWheel,PrizeEnvelope,PrizeEggs,PrizeDock,PrizeArt}.tsx`
Routes: `app/prizes{,/spin,/envelope,/egg}` — the promotion tab stays lit on all four.

## QA that was run (and undone)

Local + production, against the live DB: free ticket 200 → repeat 409;
locked deposit gate 409 with the live approved-deposit figure in the message;
2,000 ৳ deposit approved by the admin → ৳100 and ৳1,000 steps unlock and pay,
৳5,000 stays locked; ৳3,000 turnover → exactly 3 turnover tickets, 4th → 409;
wheel charge verified (fee 999, prize credited, balance moves by prize − fee);
iPhone slice hit and settled through the admin API (second settle → 404); every
QA row, ledger entry and test user deleted afterwards, demo balance restored to
৳26,893.00.
