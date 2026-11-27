# Withdrawals — bKash / Nagad / Upay, paid by hand (v50)

## The withdrawal PIN (new in v49)
Money can no longer leave an account just because a session is open.
* The player sets a **4–6 digit withdrawal PIN** the first time they take a payout — either
  on ই-ওয়ালেট বাঁধুন or directly on `/withdraw` (two fields: PIN + repeat).
* Binding **another** wallet asks for that PIN; so does **every** withdrawal.
* The PIN is stored only as a bcrypt hash. No screen, API or admin page can show it.
* **5 wrong tries → locked for 15 minutes** (server-side, so it also stops scripted guessing),
  and a locked account cannot be re-keyed either.
* Wrong PIN order: the PIN is checked **before** the turnover balance, so a guesser learns
  nothing about the account.

**Locked-out player?** They wait 15 minutes. There is no operator override on purpose — if you
must clear it, run on the database:
`UPDATE users SET withdraw_pin_failures=0, withdraw_pin_locked_until=NULL WHERE id=<id>;`
To force a brand-new PIN (player forgot it): `UPDATE users SET withdraw_pin_hash=NULL WHERE id=<id>;`
— they will be asked to set one again on their next withdrawal.

## Bound numbers (v50 — the ownership rules)
* The bind screen offers **exactly three wallets: bKash, Nagad, Upay**. PayWise is a
  collection gateway and is never offered for payouts.
* **One number per player per wallet.** Once bKash is bound, that player cannot add,
  replace or delete it — the screen shows **Wallet locked** instead of the input.
* **A number belongs to one player per wallet.** bKash `01711234593` can never be bound
  by a second account.
* The **same phone number may still be bound on a different wallet** (e.g. Upay for
  player A and bKash for player B) — that is allowed on purpose.
* These rules are enforced by the API *and* by unique indexes in the database, so no
  screen, script or race can bypass them.
* A player who genuinely needs a new number cannot swap it: that is a database change,
  reviewed by you. Past withdrawals keep the number they were paid to.

## What the admin queue shows (v50)
Each pending withdrawal row prints the whole payout instruction:

```
WHEN          PLAYER   CHANNEL   PAYOUT ACCOUNT
25 Nov, 06:55 demo     [bKASH]   01711234593  [Copy]
                                 ✓ bound to this player · since 24 Nov 2026, 11:10
                                 Send ৳1,500.00 → bKash 01711234593, then Approve
```

If the number on the request is no longer the player's current bound number the line
turns into `⚠ not the currently bound bKash number — check before paying`.

## How a payout runs now

## Bound numbers (v50 — the ownership rules)
* The bind screen offers **exactly three wallets: bKash, Nagad, Upay**. PayWise is a
  collection gateway and is never offered for payouts.
* **One number per player per wallet.** Once bKash is bound, that player cannot add,
  replace or delete it — the screen shows **Wallet locked** instead of the input.
* **A number belongs to one player per wallet.** bKash `01711234593` can never be bound
  by a second account.
* The **same phone number may still be bound on a different wallet** (e.g. Upay for
  player A and bKash for player B) — that is allowed on purpose.
* These rules are enforced by the API *and* by unique indexes in the database, so no
  screen, script or race can bypass them.
* A player who genuinely needs a new number cannot swap it: that is a database change,
  reviewed by you. Past withdrawals keep the number they were paid to.

## What the admin queue shows (v50)
Each pending withdrawal row prints the whole payout instruction:

```
WHEN          PLAYER   CHANNEL   PAYOUT ACCOUNT
25 Nov, 06:55 demo     [bKASH]   01711234593  [Copy]
                                 ✓ bound to this player · since 24 Nov 2026, 11:10
                                 Send ৳1,500.00 → bKash 01711234593, then Approve
```

If the number on the request is no longer the player's current bound number the line
turns into `⚠ not the currently bound bKash number — check before paying`.

## How a payout runs now
1. **Player** opens `/withdraw`, picks **bKash / Nagad / Upay**, binds their own number
   (ই-ওয়ালেট বাঁধুন, max 4 per wallet) and requests an amount.
2. The amount is **held from the balance immediately** (ledger row `withdraw_request`).
3. **You** open the admin console → **Cashier → Withdrawals**. Each row shows the player,
   the wallet (`bKash`), **the full payout number with a Copy button**, and the amount.
4. Send the money from your own bKash/Nagad/Upay, then press:
   * **Approve** → request becomes `APPROVED` ("paid"). The held money stays debited.
   * **Reject** → the held money is **refunded** to the player's balance automatically.

The confirmation dialog now spells it out: *"Send ৳500 to Nagad 01911223344 first, then
approve."* — so the queue itself is the payout instruction sheet.

## Why you could not do this before (two real bugs, both fixed)
1. `POST /api/cashier/accounts` (bind wallet) required the row to be an **active deposit
   channel**. The payout rows are deliberately inactive as deposits — so bKash/Nagad/Upay
   could not be bound at all ("Nagad is not available for payouts"). Binding now only needs
   `for_payout = TRUE`.
2. `POST /api/cashier/request` rejected a withdrawal whose deposit row was `is_active =
   FALSE` ("temporarily unavailable"). `is_active` now only governs deposits; a withdrawal
   is checked against `for_payout` + the payout min/max instead.

## Channel data
`db/migrations/2026-11-25-withdraw-channels.sql` adds/keeps three **payout-only** rows:

| channel | account_number | is_active | for_payout | limits |
|---|---|---|---|---|
| bKash | *(empty — never shown)* | FALSE | TRUE | ৳200 – ৳25,000 |
| Nagad | *(empty)* | FALSE | TRUE | ৳200 – ৳25,000 |
| Upay  | *(empty)* | FALSE | TRUE | ৳200 – ৳25,000 |
| Rocket | *(empty)* | FALSE | **FALSE** | not offered |

`account_number` is empty on purpose: the player is *paid*, not given a number to send to,
and nothing invented is ever displayed.

## API split (so the two lists cannot pollute each other)
* `GET /api/cashier/channels` → deposit rails only (currently **PayWise**).
* `GET /api/cashier/channels?for=withdraw` → payout rails only
  (**bKash, Nagad, Upay**) — powered by `for_payout = TRUE` and never an API/collection
  gateway, because a gateway cannot pay a player out.

Verified on production: withdraw tabs = bKash / Nagad / Upay, PayWise never appears there;
a real request produced `WITHDRAW PENDING` with the full number in the admin queue;
Approve left the balance debited, Reject refunded it.

## Upay logo
`public/providers/upay.png` added (the tab previously showed an empty white box), and the
Upay payout row's `logo_url` points at it.
