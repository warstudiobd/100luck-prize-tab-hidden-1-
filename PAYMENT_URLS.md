# Payment URLs — 100LUCK / sonali7-casino

Base domain: `https://sonali7-casino.vercel.app`
All tested live, 2026-11-24.

---

## 1. SoftAggregator — seamless wallet (games)

This is the one you paste into the **SoftAggregator dashboard** (they call it the
*seamless wallet / call-back URL*). It carries balance, debit, credit and rollback.

```
https://sonali7-casino.vercel.app/api/wallet/callback
```

The same handler also answers on these three aliases, in case their form asks for
"webhook" or "seamless" wording — pick whichever, behaviour is identical:

```
https://sonali7-casino.vercel.app/api/wallet/seamless
https://sonali7-casino.vercel.app/api/wallet/webhook
https://sonali7-casino.vercel.app/api/webhook/seamless
```

- Method: **GET and POST** both accepted.
- Always replies **HTTP 200** with `{"error":0|1|2,"balance":<cents>}` — never a 4xx,
  so their retry logic behaves.
- Security: `key = md5(timestamp + SOFTAGG_SALT_KEY)` **plus** optional
  `X-Signature: HMAC-SHA256(SALT, sorted params)`. Timestamp window 30 s
  (`SOFTAGG_TIMESTAMP_WINDOW_SECONDS`).
- IP allowlist: `SOFTAGG_IP_ALLOWLIST` = `85.122.129.59` (already set in Vercel).
- Live check: `200 {"error":2,"balance":0}` — error 2 = rejected signature, which is
  the correct answer to a bare request with no parameters.

## 2. Deposit gateway — Return URL **and** Webhook/IPN

If you plug in an API deposit gateway (bKash / Nagad / Rocket switched to **API** mode
in the admin panel), these two are the same endpoint:

**Return URL (where the player lands after paying)**
```
https://sonali7-casino.vercel.app/api/deposit/gateway/callback
```

**Webhook / IPN / callback URL**
```
https://sonali7-casino.vercel.app/api/deposit/gateway/callback
```

- **GET** = player return → verifies then `303` redirects to
  `/?deposit=success` or `/?deposit=failed`.
- **POST** (JSON or form) = server-to-server IPN → replies JSON ack.
- Signature: `HMAC-SHA256(DEPOSIT_API_SECRET, raw body)` hex, header `X-Signature`
  (or `signature` / `sign` field). Verified against the **raw** body.
- Idempotent: re-sending the same IPN cannot double-credit
  (ledger `call_id = csh_dep_appr_<request_id>`).

### ⚠ Not armed yet
`DEPOSIT_API_KEY` and `DEPOSIT_API_SECRET` are **not set** in Vercel yet, so the
gateway currently answers:

```
503 {"ok":false,"error":"gateway_not_configured"}
```

Nothing is charged while it's in that state, and manual bKash/Nagad TrxID deposits
keep working normally. Add both env vars (and fill each channel's `api_base_url` +
`api_config` in the admin panel under **Deposit Options → mode: API**) to switch it on.

## 3. Not a payment URL — do not paste these

| Path | What it actually is |
| --- | --- |
| `/api/wallet/balance` | player session endpoint, returns `401 unauthorized` without login |
| `/api/deposit/gateway/initiate` | step 1 of a deposit, called by our own site (`405` on GET) |
| `/api/admin/*` | admin API, needs a 12 h admin token |
