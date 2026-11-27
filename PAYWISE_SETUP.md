# PayWise Asia — webhook setup

Live and verified. Paste this into the PayWise dashboard's **Webhook URL** field (replace whatever is there
now — the old `/api/deposit/gateway/callback` URL returned 503 and burned its retries):

```
https://sonali7-casino.vercel.app/api/payments/paywise/webhook
```

Return URL after payment (`success` / `error` links in their form):

| Field | URL |
| --- | --- |
| Success / Return URL | `https://sonali7-casino.vercel.app/?deposit=success` |
| Error / Fail URL | `https://sonali7-casino.vercel.app/?deposit=failed` |

---

## What was built (v21)

| Piece | Detail |
| --- | --- |
| Endpoint | `POST /api/payments/paywise/webhook` |
| Signature headers | `X-PAYWISE-Signature-V2` + `X-PAYWISE-Timestamp` (preferred), `X-PAYWISE-SIGNATURE` (V1 fallback) |
| Algorithm | V2: HMAC-SHA256 of `"<timestamp>.<raw body>"`, ±300 s replay window · V1: HMAC-SHA256 of the raw body |
| Secret | `PAYWISE_WEBHOOK_SECRET` in Vercel (sensitive, prod + preview) |
| Replay protection | unique `(provider, event_id)` in `webhook_events` |
| Double-credit protection | deposit only applies while `cashier_requests.status = 'PENDING'`, row locked `FOR UPDATE` |
| Audit | every delivery stored: raw body, JSON, signature verdict, scheme, ref, outcome, HTTP status, amount, IP |

## Order reference
The handler accepts the reference from any of these (first match wins):

```
transaction_id · merchant_order_id · order_id · reference · tx_ref · trx_ref
data.transaction_id · data.reference · data.order_id · data.trx_ref
payment_details.transaction_id · payment_details.reference
transaction_request.id · transaction_request.merchant_order_id
```

Whatever we send as the order id when creating the payment must be stored in
`cashier_requests.trx_ref` — that is the join key.

## Status vocabulary understood

| Paid (credits the wallet) | Dead (marks REJECTED) |
| --- | --- |
| `Completed`, `Success`, `Successful`, `Paid`, `Settled`, `Approved`, `Captured` | `Failed`, `Cancelled`, `Canceled`, `Declined`, `Expired`, `Error`, `Reversed`, `Refunded`, `Void` |

Matching is case-insensitive. Anything else is stored and ignored.

## How to check it is working
```sql
SELECT event_id, signature_ok, sig_scheme, trx_ref, outcome, http_status, amount_cents, received_at
FROM webhook_events ORDER BY id DESC LIMIT 20;
```

- `signature_ok = false` → the secret in Vercel does not match the one in PayWise.
- `sig_scheme = 'hmac:raw-hex'` → raw body hex, which is the expected scheme.
- `outcome = 'unknown_ref'` → we got the callback but the order id did not match any
  pending `cashier_requests.trx_ref`; that means the order id we sent them differs from
  the one they echo back.

## Verified end to end (local + production)

```
valid signature, pending ৳750  → 200 credited   (ledger csh_dep_appr_14, balance +৳750)
same delivery replayed         → 200 ignored    (no second credit)
wrong signature                → 401 invalid signature
valid signature, unknown order → 200 unknown_ref
live production probe          → 200 unknown_ref, scheme hmac:raw-hex
```

## Security note
The signing secret was shared in chat. If that conversation is not private, rotate it:
generate a new secret in the PayWise dashboard, then update `PAYWISE_WEBHOOK_SECRET`
in Vercel (Settings → Environment Variables) and redeploy. Nothing else needs changing.

## V2 signature (v22, live)

```
signed = `${X-PAYWISE-Timestamp}.${rawRequestBody}`
expected = HMAC-SHA256(PAYWISE_WEBHOOK_SECRET, signed)   // hex
```

Rules enforced:

- The request is rejected if the V2 header is present but `X-PAYWISE-Timestamp` is
  missing or its drift from our clock exceeds **300 s**. There is no fallback to V1 in
  that case — otherwise stripping the timestamp header would downgrade the request.
- V1 (body-only digest) still verifies, so a provider mid-migration keeps working.
  It has **no** replay protection; V2 is what should be used in production.
- Hex or base64, bare or `sha256=`-prefixed, all accepted.
- `webhook_events.sig_scheme` records which scheme matched, so the first live delivery
  proves which one PayWise actually sends.

Test with curl:

```bash
TS=$(date +%s)
BODY='{"transaction_id":"ORDER123","status":"Completed","amount":"500.00"}'
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$PAYWISE_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST https://sonali7-casino.vercel.app/api/payments/paywise/webhook \
  -H 'content-type: application/json' \
  -H "X-PAYWISE-Signature-V2: $SIG" \
  -H "X-PAYWISE-Timestamp: $TS" \
  -d "$BODY" -w ' [%{http_code}]\n'
```

## Legacy URL (v23)

`/api/deposit/gateway/callback` is now safe: a request carrying a PayWise signature is
relayed to the real receiver with the raw body intact, and an unsigned dashboard test
event is acked with `200` instead of `503 gateway_not_configured`. Point PayWise at the
`/api/payments/paywise/webhook` URL anyway — the relay is a safety net, not the target.
