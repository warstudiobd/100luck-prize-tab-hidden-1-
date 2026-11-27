# bKash / Nagad / Upay deposits — live through PayWise (v42)

## What was wrong
The PayWise row in *Deposit Options* was saved as `mode = api`, so the yellow
**Pay via gateway** button called the old `/api/payments/paywise/initiate` endpoint,
which talks to `api.paywise.co` — a host that does not resolve. Every bKash/Nagad/Upay
click therefore died with a generic error even though PayWise itself was ready.

Earlier probe scripts also sent `payment_method: "BKASH"`, which PayWise rejects with
`422 The selected payment method is invalid`. That message made it look like the merchant
account had no wallet rails.

## What is actually true
PayWise takes BDT wallets on the standard transactions endpoint, in this exact shape:

```json
POST https://paywise.asia/api/v1/transactions
{
  "merchant_reference": "PW-XXXXXX",
  "amount": 500.00,
  "currency": "BDT",
  "payment_method": "LOCAL",
  "bank_code": "BKASH",          // BKASH | NAGAD | UPAY
  "customer_id": "…",
  "return_url": "https://warstudio.site/deposit"
}
```
→ `201` with `data.checkout_url` = live hosted page (`checkout.paywise.asia/…`) showing the
wallet number, the exact amount and a TrxID prompt.

Verified on production (2026-11-25):

| Wallet | create | checkout page |
|---|---|---|
| bKash | 200 `PW-A6NER8` | live, wallet `0160925281` |
| Nagad | 200 `PW-HCWPD6` | live, wallet `01898596438` |
| Upay  | 200 `PW-RDYNHB` | live, wallet `01894668767` |
| Rocket | 400 `method_not_supported` | — (PayWise does not carry Rocket) |

Webhook credit verified: signed `payment.paid` → `{"outcome":"credited"}`, balance
2,689,300 → 2,739,300 ৳-cents; replay → `{"outcome":"already"}` (idempotent).

## Three things that made bKash/Nagad/Upay unusable in the app
1. **Wrong route.** The PayWise tile was stored with `mode = api`, so the pay button called
   the legacy `/initiate` endpoint (dead host). Fixed: any `api_provider = paywise` channel
   uses `/api/payments/paywise/create`.
2. **Wallet limits not enforced.** PayWise accepts **৳500 – ৳25,000** per bKash/Nagad/Upay
   payment (verified for all three). The app advertised ৳200–৳2,50,000, so a ৳200 or ৳30,000
   attempt was refused *after* the player picked it. Fixed: the PayWise channel is now
   ৳500–৳25,000 and out-of-range quick-amount chips are dimmed and disabled.
3. **Single-use checkout links.** `checkout.paywise.asia/<token>` works exactly once;
   re-opening the same URL answers *"Reference exist with existing Merchant."* So a player
   who closed the tab (or came back from a failed payment) could never pay. Fixed: every
   click on the pay button asks the server for a **fresh** link, and the attempt it replaces
   is retired (`previous_ref`) so it cannot sit in history as a phantom pending deposit.

Verified three times in a row on production: three fresh links, all open correctly, and the
signed webhook credits the balance (2,689,300 → 2,739,300 ৳-cents, replayed webhook = `already`).

## Code changes (v42)
- `components/views/DepositView.tsx`
  - any channel with `api_provider = paywise` now uses the working `create` flow
    (previously only `mode = link` did);
  - the initial channel now follows the server's first active row instead of a hard-coded
    `bKash`, which was not an active row and caused `channel unavailable`;
  - removed the baked-in placeholder wallets (`01711-000000`, `01911-000000`,
    `01811-000000-1`) from the built-in fallback list — no screen can ever show a fake number;
  - wallet picker offers bKash / Nagad / Upay only.
- `app/api/payments/paywise/create/route.ts` — wallet names fall back to the gateway row's
  min/max limits, so an admin does not need a `deposit_channels` row per wallet.
- `app/api/payments/paywise/create/route.ts` — honours `previous_ref` to retire the replaced
  attempt; wallet requests fall back to the gateway row's limits.
- `components/views/DepositView.tsx` — pay button always re-mints; quick chips gated by the
  real range; initial channel follows the server's first active row.
- Database: the three placeholder manual rows (bKash, Nagad, Rocket) were deactivated
  (`is_active = false`); the PayWise row's limits were set to 500.00–25,000.00 BDT.

## One setting to check in the PayWise dashboard
The hosted page shows **PayWise's** collection wallet (`0160925281` etc.) and asks the
player for a TrxID. If you would rather collect into **your own** bKash/Nagad number, that
is a merchant-side setting — ask PayWise support to point the collection wallet at yours.

Return URL / webhook already registered:
- Return:  https://warstudio.site/deposit
- Webhook: https://warstudio.site/api/payments/paywise/webhook
