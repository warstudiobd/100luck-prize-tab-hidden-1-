# PayWise URLs — after the move to warstudio.site

Copy these into the PayWise dashboard exactly as written (no trailing slash, https).

| Field in PayWise | Value |
|---|---|
| **Return URL** (after payment) | `https://warstudio.site/deposit` |
| **Webhook URL** (callback) | `https://warstudio.site/api/payments/paywise/webhook` |
| **Website / domain** (if it asks for approved domains) | `warstudio.site` (and `www.warstudio.site`) |

Rules of thumb:
- **Both fields are optional in the app's own flow** — a deposit still completes and still credits
  even if PayWise's dashboard has no return URL, because the wallet is credited by the *webhook*,
  and the player can always press "I have paid — check status".
- The **webhook URL is the one that matters**. Without it, a payment only lands when the player
  presses the status button (the server then polls PayWise).
- The return URL answers `422 RETURN_URL_NOT_ALLOWED` if its domain is not registered on the
  merchant account. `warstudio.site` is accepted as of 2026-11-25 (verified: a transaction created
  with it returned 201).

## Where these live in the code
`lib/site-url.ts` resolves the public address in this order:

1. `platform_settings.site_url` (admin → Settings → **Payment URLs**)
2. env `SITE_URL` / `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`
3. `https://warstudio.site` (built-in default)
4. the request origin (last resort)

Never the request origin first: a request can arrive on a `*.vercel.app` deployment host, and a
webhook URL on a host PayWise does not know is exactly the bug this prevents.

## Verified end to end on the new domain (2026-11-25)
```
POST https://warstudio.site/api/payments/paywise/crypto {USDT, 10}
  → 200 PW-YMBY6R  pay 10.21 USDT  addr 0x21ea31Ff57…  checkout ✓
signed webhook → https://warstudio.site/api/payments/paywise/webhook
  → 200 {"ok":true,"outcome":"credited"}  balance 2,689,300 → 2,690,300
  (test rows removed, balance restored)
POST paywise.asia/api/v1/transactions with return_url=https://warstudio.site/… → 201 (accepted)
```

## Admin panel

| What | URL |
|---|---|
| Admin console | `https://admin.warstudio.site` |
| Player site / API | `https://warstudio.site` |
