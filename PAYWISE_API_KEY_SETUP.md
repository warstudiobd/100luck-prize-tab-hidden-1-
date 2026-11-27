# Where to add the PayWise API key — step by step

You need **two different keys** from PayWise, and they go into **two different places**.

| Key | Looks like | Goes |
| --- | --- | --- |
| Merchant key *(you already sent it)* | `pw_live_cWFD…` | JSON body field `api_key` |
| Developer key *(this is missing)* | `pwsk_prod_…` | request header `PW-subscription-key` |

PayWise's own checklist says it plainly: *"`pw-subscription-key` goes in the request
header (all API calls). Some products (like Payments Checkout) also require a business
`api_key` in the JSON body."* Both are needed. The merchant key alone returns
`401 PW_SUBSCRIPTION_KEY_INVALID` — I tested it.

---

## Part 1 — Get the developer key from PayWise

### 1. Open the right dashboard
| Environment | Dashboard | API host | Key prefix |
| --- | --- | --- | --- |
| Live (real money) | https://dashboard.paywise.co | `https://api.paywise.co` | `pwsk_prod_…` |
| Sandbox (test money) | https://sandbox-dashboard.paywise.co | `https://sandbox-api.paywise.co` | `pwsk_sbx_…` |

You have been working in the `paywise.asia` merchant panel (Websites & webhook, API logs).
That is fine for webhooks, but the **developer key is generated in the dashboard above**,
under the developer/API section — look for "Developers", "API Keys" or "Developer project".

### 2. Create a developer project
If the page says you have no project, create one first (name it `sonali7-casino`).
A project holds the developer key.

### 3. Generate the key
Click **Generate / Create key**. Copy the value — it starts with `pwsk_prod_` (live) or
`pwsk_sbx_` (sandbox). It is shown once, so copy it straight away.

### 4. Request production access
`POST /payments/request` on the **live** host needs PayWise's manual approval. Sandbox is
auto-approved. If live calls still return an approval error after you add the key, ask
their support (`support@paywise.asia`) to enable **Payments / Checkout** for your business
account and confirm the business `api_key` is active.

### 5. Check the webhook URL while you are there
`Websites & webhook` → webhook URL must be:

```
https://sonali7-casino.vercel.app/api/payments/paywise/webhook
```

(not `/api/deposit/gateway/callback` — that is the old one that returned 503).

---

## Part 2 — Put the key into the site

Keys must **never** go in the code or the repo. They live in Vercel environment variables.

### Option A — send it to me (30 seconds)
Paste the `pwsk_prod_…` value in chat. I add it to Vercel, redeploy, and run a test
deposit. Nothing else for you to do.

### Option B — add it yourself
1. Open https://vercel.com/bet-8d8c/sonali7-casino/settings/environment-variables
2. Click **Add New** (or "Create new").
3. Fill in:
   - **Key:** `PAYWISE_SUBSCRIPTION_KEY`
   - **Value:** the `pwsk_prod_…` key
   - **Environments:** tick **Production** and **Preview**
4. **Save**.
5. Redeploy so the new variable is picked up: **Deployments** → newest deployment → `⋯`
   → **Redeploy** (or ask me and I will deploy).
6. Check it worked — open in a browser:

```
https://sonali7-casino.vercel.app/api/payments/paywise/initiate
```

It should read `"configured": true` and `"missing": []`. If it still lists
`PAYWISE_SUBSCRIPTION_KEY`, the redeploy has not finished or the variable was saved to the
wrong environment.

### Current state of the variables

| Variable | Status | Purpose |
| --- | --- | --- |
| `PAYWISE_WEBHOOK_SECRET` | ✅ added | verifies `X-PAYWISE-Signature-V2` |
| `PAYWISE_API_KEY` | ✅ added | merchant key in the JSON body |
| `PAYWISE_SUBSCRIPTION_KEY` | ❌ **missing — this is the one** | `PW-subscription-key` header |
| `PAYWISE_BASE_URL` | optional | default `https://api.paywise.co` |
| `PAYWISE_ORIGIN_COUNTRY` | optional | default `BD` |
| `PAYWISE_IP_ADDRESS` | optional | only if PayWise asks for a fixed IP |

---

## Part 3 — Test it (sandbox first is safer)

- **Sandbox:** set `PAYWISE_BASE_URL=https://sandbox-api.paywise.co`, use the `pwsk_sbx_…`
  key and the sandbox `api_key`. Note sandbox defaults to country `TT` and currency `TTD`
  in PayWise's examples — I would switch our currency/origin for sandbox mode, tell me and
  I will add that toggle.
- **Live:** with `pwsk_prod_…`, deposit ৳100 from the site. You should land on a PayWise
  payment page, pay, come back to `/?deposit=success`, and the ৳100 should appear in the
  wallet within seconds — credited by the webhook, exactly once.

If the deposit screen instead shows "Gateway isn't connected yet", the key is still
missing or the redeploy did not happen. Run the diagnostic URL above to see which.

---

## What NOT to do

- Do not paste keys into `DEPLOY.md`, a WhatsApp message, or the code. Vercel only.
- Do not use `pwsk_sbx_…` on the live host or `pwsk_prod_…` on sandbox — PayWise rejects
  the mismatch.
- Do not put the merchant `api_key` in the `PW-subscription-key` header. That is exactly
  the `401` we hit.
- Once everything works, rotate both keys in the dashboard (this chat has seen them) and
  update the two Vercel variables.
