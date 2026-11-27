# Moving 100LUCK to another platform

Written for this project as it actually is today (2026-11-23). Everything below was
checked against the live system, not assumed.

---

## First: three things that will bite you if you skip them

**1. Your DNS is hosted by Vercel.** `warstudio.site` uses `ns1.vercel-dns.com` /
`ns2.vercel-dns.com`. Moving hosts is not "change an A record" — you must first move the
**nameservers** at your domain registrar to another DNS provider (Cloudflare is the usual
choice), recreate the records there, *then* repoint the site. Do this in that order or the
domain goes dark.

**2. Re-packing the app alone will not work.** The Vercel project does not hold your code
the way a Git deploy would — its install command pulls the project from a Google Drive
tarball on every build. If you leave Vercel before creating a real repository, the only
copies of your source are this workspace and one Drive file.

**3. There is no git repo.** No version history exists. Fix that *before* you touch
anything else — see step 1.

---

## What you actually have

| Piece | Where it lives today | Notes |
|---|---|---|
| Player site (Next.js 16) | Vercel project `sonali7-casino` (`prj_BCrWkMcpt9UZfpKGvYrCrmzA2jPg`) | App Router, Node `26.x`, functions in `iad1` |
| Source of truth | **this workspace** + `site58.tar.gz` on Google Drive | 820 files, 4.7 MB packed |
| Admin panel | separate Vite + React app in `admin/` | Builds to static `admin/dist` |
| Database | Supabase Postgres (pooler `aws-1-us-east-1`) | 21 MB, 28 tables |
| DNS | **Vercel DNS** | must be migrated first |
| APK | `public/download/100LUCK-1.0.0.apk` | served as a static file |
| Play bundle | `100LUCK-1.0.0.aab` | unsigned-by-Google upload key in `android-app/keystore/` |
| Payments | PayWise (deposits), SoftAggregator (game launch) | callbacks pointed at your domain |
| Email/other | none | no cron jobs, no queues, no storage buckets |

Good news: **there is no Supabase SDK in the code.** It just uses `pg` against a plain
Postgres URL, so your database can move to any managed Postgres (Neon, RDS, Railway) with
no code changes.

---

## Step 1 — Get the code into git (do this first, today)

```bash
cd /home/user
git init
```

Create a `.gitignore` that keeps secrets **out** (the current one only ignores
`node_modules`, `.next`, `.env.local`, `*.log` — that is not enough):

```gitignore
node_modules/
.next/
out/
.env*
!.env.example
*.log
android-app/build/
android-app/build-aab/
android-app/keystore/
backups/
*.tar.gz
```

Verify nothing secret is staged before the first commit:

```bash
git add -A
git status --short | grep -E "\.env|keystore|\.jks|backups/" && echo "STOP — remove these"
```

Then commit and push to a private GitHub/GitLab repo. This single step de-risks everything
else: from here on, any platform can deploy from Git instead of a tarball.

**Never commit** `.env.local`, either `.jks` keystore, or `backups/`. If they ever land in
a public repo, rotate every key in the table at the bottom.

---

## Step 2 — Move the database

Your data is small (21 MB), so this is a `pg_dump` / `pg_restore` and a coffee.

```bash
# export from Supabase
pg_dump "$SUPABASE_DATABASE_URL" --no-owner --no-privileges -Fc -f 100luck.dump

# import into the new Postgres
pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL" 100luck.dump
```

Notes that matter here:

- Supabase's pooler URL is `...pooler.supabase.com:6543`. If your new host gives you a
  **direct** connection on `5432`, prefer it for `pg_dump`, then run the app on the pooled
  URL. Serverless functions exhaust direct connections otherwise.
- Append `?sslmode=require` (or `&sslmode=require`) to `DATABASE_URL` on the new host —
  most managed Postgres rejects non-TLS.
- Your app assumes the schema already exists. `db/schema.sql` and `db/migrations/*` are in
  the workspace if you ever need a clean rebuild, but **restore the dump, don't re-run the
  schema**, or you lose live rows.
- After restore, sanity-check these exist and have rows: `users`, `games_catalog`
  (10,764 rows), `wallet_ledger`, `deposit_channels`, `announcements`.

---

## Step 3 — The `public/thumbs/games/` folder is load-bearing

`scripts/gen-game-thumbs.js` pre-generated 570 WebP thumbnails into
`public/thumbs/games/`. The API rewrites `thumbnail_url` to those paths. **They are part of
the repo** (4.6 MB) and must ship with the build on the new host, otherwise the lobby falls
back to 700 KB CDN originals and gets slow again — that was the whole v57 fix.

If the new platform has a read-only filesystem or you'd rather not ship them, run
`node scripts/gen-game-thumbs.js` during build and serve the output some other way. Do not
simply delete the folder.

---

## Step 4 — Pick a host that can actually run this

The site needs a **persistent Node server** (Next 16 App Router, server components, API
routes, `pg` connections). It is *not* a static export.

| Platform | Works? | Notes |
|---|---|---|
| **Vercel** (current) | yes | nothing to do |
| **Netlify** | yes | use the Next.js runtime adapter |
| **Railway / Render / Fly.io** | yes | best fit — long-lived Node, real Postgres |
| **VPS + Docker/PM2** | yes | most work, most control |
| **Cloudflare Pages / Workers** | **no, not as-is** | no Node runtime; `pg` + `next start` won't run without a rewrite |
| **GitHub Pages / S3 static** | **no** | there is no static export |

Minimum to run: `npm install` → `npm run build` (`next build`) → `npm start`
(`next start -H 0.0.0.0 -p 3000`). Node 20+ (Vercel runs 26.x today).

**Server region matters for you specifically.** Production currently serves from `iad1`
(Virginia). A visitor in Bangladesh measured **~2.5 s LCP** on a simulated 1.6 Mbps link,
and about 1.5 s of that is moving 495 KB of JavaScript across the Pacific. Moving the
server to Singapore or Mumbai would help more than any code change — pick the region
deliberately when you choose the host.

---

## Step 5 — Environment variables

The code reads exactly these (verified by scanning `app/ lib/ components/ scripts/`):

```
DATABASE_URL                 JWT_SECRET                  SESSION_SECRET
ADMIN_USERNAMES              ADMIN_PANEL_ORIGIN
NEXT_PUBLIC_SITE_URL         NEXT_PUBLIC_APP_URL         SITE_URL
PAYWISE_API_KEY              PAYWISE_SUBSCRIPTION_KEY    PAYWISE_WEBHOOK_SECRET
PAYWISE_BASE_URL             PAYWISE_CHECKOUT_BASE_URL   PAYWISE_ORIGIN_COUNTRY
PAYWISE_IP_ADDRESS
SOFTAGG_BASE_URL             SOFTAGG_API_LOGIN           SOFTAGG_API_PASSWORD
SOFTAGG_SALT_KEY             SOFTAGG_TIMESTAMP_WINDOW_SECONDS
SOFTAGG_IP_ALLOWLIST         SOFTAGG_PLAYER_SECRET
DEPOSIT_API_KEY              DEPOSIT_API_SECRET          PROVIDER_MASTER_KEY
```

On Vercel these are stored encrypted and are **not** in the tarball — you must export them
from Vercel's dashboard (Settings → Environment Variables) and re-enter them on the new
host. `.env.local` in this workspace only holds the ones used for local dev; it is
incomplete by design and must never be shipped.

---

## Step 6 — Fix the outbound URLs (the step people forget)

These are hard-coded to your current domains and will silently break after a move:

| What | Where it points now | Change to |
|---|---|---|
| Payment/webhook callback | `sonali7-casino.vercel.app/api/wallet/callback` (+ 3 aliases, `/api/deposit/gateway/callback`) | your new domain + same paths |
| Provider IP allowlist | `SOFTAGG_IP_ALLOWLIST=85.122.129.59` | the new host's **egress** IPs, or game launches will be refused |
| Admin panel API base | `admin/src` → `https://warstudio.site` | new domain, then rebuild admin |
| APK / AAB | `MainActivity.SITE = "https://warstudio.site/"` | new domain, then re-sign and re-release the APK |
| Canonical / sitemap / robots | `NEXT_PUBLIC_SITE_URL` + `CANONICAL_SITE_URL` | new domain |

The **PayWise dashboard** must be updated with the new callback URL, and the **SoftAgg
allowlist** with your new server IPs. Neither is something you can fix from code alone —
both need the provider's admin panel. Sequence it so there is no window where payments are
pointed at a dead host: stand the new site up on its temporary URL first, verify it, then
switch the provider callbacks, then switch DNS.

---

## Step 7 — Custom domain

1. Create the new DNS zone at Cloudflare (or wherever), recreate **every** record you have
   at Vercel DNS today — including the `google-site-verification` TXT and the
   IndexNow/SEO records.
2. Change the **nameservers at your registrar** to the new provider. Propagation is hours.
3. Add the domain in the new host, let it issue TLS.
4. Keep the old Vercel project alive for at least a week after DNS moves, so you can roll
   back by pointing DNS at it again.

`admin.warstudio.site` currently has no CNAME record — if you intend to publish the admin
panel, create it deliberately during this step.

---

## Step 8 — Verify after the move

```bash
# every page, in a real browser, not just curl
BASE=https://newdomain node /tmp/qa/audit.mjs      # 11 pages, checks console + broken images
node /tmp/qa/e2e.mjs                                # login, launch game, deposit, withdraw, prizes
curl -sI https://newdomain/api/games | grep -i cache   # expect s-maxage cache header
```

Then confirm, in order: a real deposit lands in `wallet_ledger`; a game launches (proves the
SoftAgg allowlist); the APK still opens the site; `/admin` can log in.

These scripts live in `/tmp` and will not survive; copy `scripts/e2e-test.mjs` into the repo
and port the audit if you want them permanently.

---

## What you cannot take with you

- **Vercel's edge network.** The HTML cache headers (`s-maxage`, `stale-while-revalidate`)
  are only as good as the CDN in front of your new host. If the new host has no CDN, put
  Cloudflare in front or the lobby will regress.
- **Vercel build cache.** Every deploy will re-run `gen-game-thumbs` if you move that into
  the build (currently it does *not* run at build — the files are committed).
- **The `.vercel` project link.** Irrelevant; you're replacing it.

## Cost/effort estimate

| Step | Time |
|---|---|
| git + repo | 30 min |
| DB dump/restore + verify | 1–2 h |
| host setup + env vars | 2–4 h |
| provider callbacks + IP allowlists | 1 h, plus waiting on providers |
| DNS move + propagation | 1 h of work, up to 24 h waiting |
| full verification | 2 h |
| **total** | **about one focused day, mostly waiting** |

The order above is the safe one: **git → database → new host on a temp URL → provider
callbacks → DNS last.** DNS last means there is never a moment where the domain points at
something that cannot take a deposit.
