# Payment gateway — does it work? (checked 2026-11-24, production)

Short answer: **receiving works, sending does not.** A PayWise payment cannot start
from the site yet, so a real player still has no way to pay through the gateway.

---

## ✅ Working — PayWise webhook (verified on the live site)

Tested with real HTTP against `https://sonali7-casino.vercel.app`, not just locally:

| Step | Result |
| --- | --- |
| Player submits ৳500 deposit (`trx_ref = PWLIVE1795531099`) | request id 15, status PENDING |
| PayWise sends signed `Completed` callback | `200 credited` |
| Same callback replayed | `200 ignored` — no second credit |
| Balance | ৳26,893.00 → ৳27,393.00 (+৳500) |
| Signature verdict | `signature_ok = true`, scheme `hmac:raw-hex` |
| Wrong signature | `401 invalid signature` |

All test rows removed afterwards; `demo` is back to ৳26,893.00, `cashier_requests` = 0,
`webhook_events` = 0.

So: **money coming in from PayWise is safe and idempotent.**

## ❌ Not working — starting a payment

| Check | Result |
| --- | --- |
| `deposit_channels` mode | bKash, Nagad, Rocket are all `manual` |
| Deposit screen API button | `400 channel is not API-enabled` |
| `DEPOSIT_API_KEY` | not set → would be `503 gateway_not_configured` |
| PayWise "create payment request" code | **does not exist** — only the webhook was built |
| PayWise credentials (`PW-subscription-key`, api_key) | not configured anywhere |
| PayWise order-id field name | unconfirmed (`transaction_id` vs `merchant_order_id`) |

That means the deposit screen today still shows the **manual TrxID** flow only — type the
amount, send money by bKash yourself, paste the TrxID, wait for admin approval. That path
works and is unchanged.

## What is still needed to finish

1. **PayWise API credentials** — subscription key, api key, merchant id, origin country
   (BD), and which base URL: sandbox `https://sandbox-api.paywise.co` or live
   `https://api.paywise.co`.
2. **The order-id field name** they echo back in callbacks (see `PAYWISE_SETUP.md`).
3. Then the missing piece gets built: `POST /api/deposit/paywise/initiate` that creates
   the PENDING `cashier_requests` row, asks PayWise for a payment link with
   `urls.success / notify / callback / error`, and redirects the player to it. After that
   one channel gets switched to `mode = 'api'` in admin → deposits go straight through.

Until step 3 exists, do not tell players the gateway is live.

---

## Update (v24)

Deposit creation is now **built**: `POST /api/payments/paywise/initiate` creates the
PENDING order, asks PayWise for a hosted payment link and redirects the player.

It is blocked on one credential: **`PAYWISE_SUBSCRIPTION_KEY`** (32-char developer key
for the `PW-subscription-key` header). The `pw_live_…` merchant key alone returns
`401 PW_SUBSCRIPTION_KEY_INVALID` — verified against the live API.

---

## v26 — deposit screen details

- PayWise tile readable on mobile (was truncated to "PayWi…"), gold `GATEWAY` badge.
- Channel chips show names, not "Channel 01".
- Footer button: **Continue to payment** on the PayWise channel → payment step with the
  reference; wallet channels still say "Confirm deposit".

---

## v28 live — 2026-11-23 · dpl_DYNAJb6tf42JdipsTrcvoS7s1PKB

Deposit screen now has no "payment channel" chips. PayWise is a normal wallet tile.
Continue to payment → PayWise step → `Pay with` bKash / Nagad / Rocket →
`Pay with <method> via PayWise` opens the gateway carrying method + amount + reference.
Manual number (01700-000000) still sits under it as fallback.

Production check just now:
```
chips removed: true
bKash  -> https://paywise.asia/pay?method=bkash&amount=300.00&ref=PW-7GK7HB
Nagad  -> https://paywise.asia/pay?method=nagad&amount=300.00&ref=PW-7GK7HB
Rocket -> https://paywise.asia/pay?method=rocket&amount=300.00&ref=PW-7GK7HB
```

### Still placeholder — you must fill these
| Item | Now | Needs |
|---|---|---|
| `gateway_url` template | `https://paywise.asia/pay?method={method}&amount={amount}&ref={ref}` | real PayWise payment link (or 3 per-method links) |
| PayWise `account_number` | `01700-000000` | your real receiving number |
| Admin panel | not redeployed | redeploy so the new gateway fields are editable |

Where: Admin → Gateways → PayWise (checkout link / gateway template / bKash / Nagad / Rocket URLs).

---

## v30 — navigation is per-page now (2026-11-25)

Every screen has its own link: `/` `/deposit` `/promotion` `/withdraw`
`/withdraw/bind` `/withdraw/records` `/member`. Back and Forward move one screen at a
time instead of dropping to the home page; a refresh on a deep page stays there.

Gateway return now lands on `/deposit?deposit=pending&ref=…&amount=…&channel=…`, so the
player comes back to the payment step with the reference already filled in and a
**check status** button that asks PayWise for the truth.

Still the same one blocker for real money: PayWise has not approved bKash/Nagad/Upay for
this merchant account (`403 PAYMENT_METHOD_NOT_APPROVED`). Until it does, the deposit page
says so plainly and shows the live manual number with the reference.

---

## v31 — subscription key received and wired (2026-11-25)

`pwsk_prod_…` is now `PAYWISE_SUBSCRIPTION_KEY` in Vercel (id `Oks92pExyjjMcXv3`,
production + preview). `lib/paywise.ts` now speaks **both** PayWise products:

* **Checkout** `https://api.paywise.co/payments/request?version=2024-10-01`
  (`PW-subscription-key` + `PW-origin-country` + `PW-request-date` + `PW-ip-address` +
  `User-Agent`, body carries the merchant `api_key`) → returns the hosted `payers[0].url`
  the player pays on. Tried first.
* **Transactions API** `https://paywise.asia/api/v1` → fallback (QRIS/USDT/LOCAL rails).

Checked live with the real key just now:
```
GET  /payments/status (no id)        → 403 PW_MERCHANT_ACCESS_REQUIRED
POST /payments/request (BDT wallet)  → 403 PW_MERCHANT_ACCESS_REQUIRED
POST /payments/request (TTD, 5..5000)→ 403 PW_MERCHANT_ACCESS_REQUIRED
POST paywise.asia /transactions BKASH→ 403 PAYMENT_METHOD_NOT_APPROVED
```
So the key is valid (it authenticates; a wrong key answers 401) but **PayWise has not
granted this merchant production access yet**. Nothing on our side can bypass that.

**To switch payments on, PayWise must do two things for this merchant:**
1. Approve **production access for `POST /payments/request`** (Checkout).
2. Approve the **BDT rails** — bKash, Nagad, Upay — on the merchant account.

Then, in Admin → Deposit Options → PayWise, set **"PayWise payout mobile"** to the wallet
number that should receive the money. That is the last thing the site needs; the checkout
link is created and the player is redirected automatically from then on.

---

## v32 — PayWise is FIXED for real money: USDT deposits work (2026-11-25)

Probing the live merchant account showed exactly one rail is switched on:

```
POST paywise.asia/api/v1/transactions  payment_method=USDT network=BEP20  → 201 + address
POST … BKASH / NAGAD / UPAY                                              → 403 PAYMENT_METHOD_NOT_APPROVED
POST … BTC / ETH / TRX / SOL / LTC                                       → 422 invalid payment method
POST api.paywise.co /payments/request (Checkout)                         → 403 PW_MERCHANT_ACCESS_REQUIRED
```

So the site now sells what actually works instead of a button that refuses.

### What the player sees
Deposit screen → **Crypto** tab (it was "SOON", now live):
USDT · BEP20 only → amount in USDT → **Get deposit address** →
"Send exactly **10.21 USDT**" (PayWise's fee already included) + the deposit address with
copy buttons + **Open the PayWise payment page** + **I have paid — check status**.

### Verified end to end on production
```
create : 200 PW-ETCMAU  pay 10.21 USDT  BEP20  addr 0x41Af754400B2…  checkout true
webhook: 200 {"ok":true,"outcome":"credited"}   balance 2,689,300 → 2,690,300
retry  : 200 {"ok":true,"outcome":"already"}    balance unchanged
```
(test row and test credit removed afterwards — the demo balance is back to ৳26,893.00)

### Files
| File | What |
|---|---|
| `app/api/payments/paywise/crypto/route.ts` | new — creates the USDT payment, rolls the pending row back on refusal, retries without `return_url` when PayWise rejects the domain |
| `lib/paywise.ts` → `createCryptoTransaction()` | USDT/BEP20 create call |
| `components/views/DepositView.tsx` | Crypto tab + USDT card, history shows USDT for crypto rows |

### Still blocked on PayWise (their approval, not code)
- BDT rails bKash / Nagad / Upay → `PAYMENT_METHOD_NOT_APPROVED`
- Checkout host `api.paywise.co` → `PW_MERCHANT_ACCESS_REQUIRED`

Ask PayWise support for those two; the BDT screen is already wired and will start
redirecting the moment they are granted.
