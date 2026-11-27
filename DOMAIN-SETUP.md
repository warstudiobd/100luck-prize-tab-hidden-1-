# Connecting a new Cloudflare domain to 100LUCK

Your setup: **keep Cloudflare in front** (WAF + DDoS), **keep both domains working**.
Follow this top to bottom. Stop at the first step that fails.

Replace `YOURDOMAIN.com` with your real domain everywhere below.

---

## Step 0 — the one rule that matters

**Do not put the whole domain behind the orange cloud.**

Vercel issues a TLS certificate by reading a DNS record over plain public DNS. A record
proxied by Cloudflare (orange cloud) resolves to a Cloudflare IP instead, so Vercel sees
a wrong answer, refuses to issue the certificate, and you get a redirect loop or
`ERR_TOO_MANY_REDIRECTS` on an HTTPS site with a broken padlock.

So:

| Record | Cloudflare proxy | Why |
|---|---|---|
| `@` (root) | **DNS only — grey cloud** | Vercel must see this domain directly |
| `www` | **DNS only — grey cloud** | same |
| `admin` | **DNS only — grey cloud** | same |
| everything else | Proxied is fine | nothing to verify there |

You still get **full DDoS protection for free** — it is included on the free plan even
with the cloud greyed out. What you give up is Cloudflare's WAF rules, bot fight, and
Cloudflare caching on those three hostnames. Vercel's own firewall covers that gap.

> If you *must* have the orange cloud on the apex (for a Cloudflare WAF rule), the only
> reliable way is **Cloudflare for SaaS** (custom hostnames) or switching the apex to
> Vercel nameservers. Both are more work and more breakage. Start grey.

---

## Step 1 — a second decision only you can make

**PayWise is the important one.** Your webhook is signature-verified by HMAC
(`app/api/payments/paywise/webhook/route.ts`), so a new domain is not silently broken —
but the moment you move traffic, PayWise must be told where to send payment results.

Before you start, decide:

- **Option A — new domain becomes the main site.** Then before switching traffic, update
  the PayWise callback URL in their dashboard to
  `https://YOURDOMAIN.com/api/payments/paywise/webhook`.
- **Option B — keep `warstudio.site` as the payment domain.** Then do nothing at PayWise;
  both domains serve the same site, and deposits keep working through the old address
  while you test the new one. **This is the safe path, and it is what "keep both
  working" buys you.**

Also confirm your SoftGaming / game-provider panel allows the new domain as a return/
origin host if it pins one. The code now sends the new domain automatically
(`CANONICAL_SITE_URL`), so if the provider rejects it you will see it on the first game
launch, not in production data.

---

## Step 2 — add the domain to Vercel

In the Vercel dashboard, project **`sonali7-casino`** → *Settings* → *Domains* → **Add**,
enter `YOURDOMAIN.com`. Add `www.YOURDOMAIN.com` too.

Vercel will show you the required DNS values. They will be:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `216.198.79.1` |
| `A` | `@` | `64.29.17.1` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Use **exactly the values Vercel shows you** — they change over time, and the two A
records are both required (Vercel rotates between them).

Tell me when you are at this screen and I can add the domain to the project from here,
so the panel records exist before you touch DNS.

---

## Step 3 — create the DNS records in Cloudflare

Cloudflare dashboard → your domain → **DNS** → *Records* → **Add record**.

Create four records:

1. `A` — Name `@`, IPv4 `216.198.79.1`, **Proxy: DNS only (grey)**
2. `A` — Name `@`, IPv4 `64.29.17.1`, **Proxy: DNS only (grey)**
3. `CNAME` — Name `www`, Target `cname.vercel-dns.com`, **Proxy: DNS only (grey)**
4. `CNAME` — Name `admin`, Target `cname.vercel-dns.com`, **Proxy: DNS only (grey)**

For the admin panel, also add it in the **`sonali7-admin`** project → Domains →
`admin.YOURDOMAIN.com`. The panel now derives its API address from its own hostname, so
`admin.YOURDOMAIN.com` automatically talks to `YOURDOMAIN.com` — no rebuild needed.

**Turn off "Universal SSL" redirect issues:** Cloudflare → *SSL/TLS* → set encryption mode
to **Full (strict)**. If it is on *Flexible*, you get an endless redirect loop, because
Vercel already serves HTTPS and Flexible tells Cloudflare to talk HTTP to it.

---

## Step 4 — tell the app its new address

Two separate places, on purpose:

**a) The build-time canonical URL** (sitemap, robots.txt, canonical tags):

Vercel → `sonali7-casino` → *Settings* → *Environment Variables* → add

```
NEXT_PUBLIC_SITE_URL = https://YOURDOMAIN.com
```

then redeploy. Until you do, those files still point at `warstudio.site`, which is
correct while both domains serve the same site.

**b) The runtime URL handed to PayWise** (return_url + webhook):

Admin panel → *Settings & Turnover* → **Site URL** → set to `https://YOURDOMAIN.com` and
save. This takes effect within 60 seconds, **no deploy needed**. Do this only when you are
ready for PayWise traffic to move.

> Order matters: if you change the site URL before PayWise's dashboard knows the new
> webhook address, payment confirmations go to a URL PayWise does not recognise and
> deposits sit PENDING. Change PayWise first, then this setting.

---

## Step 5 — verify, in this order

Run these from your phone or any computer:

```bash
# 1. DNS resolves to Vercel, not Cloudflare
dig +short YOURDOMAIN.com
dig +short admin.YOURDOMAIN.com

# 2. Certificate is valid AND issued by Vercel
curl -sI https://YOURDOMAIN.com | head -3

# 3. No redirect loop (should be one 200, not a chain of 301s)
curl -sIL https://YOURDOMAIN.com | grep -iE "^(HTTP|location)"

# 4. The site actually renders
curl -s https://YOURDOMAIN.com | grep -o "<title>[^<]*</title>"
```

Then in a browser, on the new domain:

- home page loads and the game lobby appears
- log in with a test player
- open **Deposit** — the PayWise page opens (this proves the gateway config)
- open **Withdraw** — it shows *Minimum withdrawal ৳500*
- open the admin panel at `admin.YOURDOMAIN.com` and load *Users* — proves the panel
  found the API at the new apex

---

## What I already changed in the code for you

| Change | Why |
|---|---|
| `CANONICAL_SITE_URL` reads `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | Moving domains is now an env change + redeploy, not a code edit across 26 files |
| Provider `return_url` follows `CANONICAL_SITE_URL` | Game launches return to the live domain instead of a hardcoded one |
| Admin panel derives its API base from its own hostname | `admin.NEWDOMAIN.com` works with no rebuild and no manual field |
| HTML served `no-store` (earlier today) | Changing domains cannot serve a stale cached page from the old host |

**Not changed, and deliberately so:** the provider-facing player email
`player<ID>@warstudio.site` in `app/api/games/launch/route.ts`. That address is an
identifier the game provider already has on file. Changing it mid-flight risks rejecting
existing players. Move it in a separate, tested change once the domain is stable — tell me
and I will do it.

---

## Common failures and what they mean

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL mode is *Flexible* | Set **Full (strict)** |
| "Invalid Configuration" in Vercel Domains | record still orange-clouded, or wrong IP | Grey the cloud, re-check the two A records |
| `525 SSL handshake failed` | Cloudflare proxied, Vercel cert not yet issued | grey cloud first, wait for cert, then decide |
| Site loads but games fail to launch | provider does not allow the new origin host | check the SoftGaming panel's allowed origins |
| Deposits stay PENDING | PayWise webhook still points at the old domain | update the callback URL in PayWise, then the Site URL setting |
| Admin panel shows "Failed to fetch" | panel on new host, API base cached in the browser | press *Sign out*, then set the API base field back to blank |
