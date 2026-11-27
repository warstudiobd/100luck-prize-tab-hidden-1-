# Making it permanent

"Permanent" here means: **nothing you do today breaks the site next month, and nothing
anyone else does takes it offline without you knowing.** That is a short list. Here is
each item, what I already fixed in code, and what only you can do.

---

## What I fixed today (deployed, verified on warstudio.site)

### 1. The bug that would have taken you down at your first busy day

`lib/db.ts` opened **up to 10 Postgres connections per lambda**. Vercel runs many
instances in parallel, so a traffic spike fans out into dozens of instances each holding
ten connections, and Supabase answers **`too many clients already`**. The site goes down
exactly when it is busiest, and it looks like a database outage.

Now:

| Before | After |
|---|---|
| `max: 10` per instance | `max: 3`, tunable with `DB_POOL_MAX` |
| idle connections held 30 s | 10 s, `allowExitOnIdle` so dead sockets are dropped |
| no query timeout | `statement_timeout=15s` — a stuck query fails instead of hanging |
| pool not shared across hot reloads | cached on the global in every environment |
| an idle connection error could kill the lambda | `pool.on("error")` logs instead of crashing |

Verified: 20 concurrent requests to the live site, all 200s.

**This is the single most important change in this document.** It is the difference
between "the site goes down when you advertise" and "the site holds."

### 2. You can now tell whether it is up

`GET /api/health` answers in milliseconds:

```json
{ "ok": true, "db": "up", "ms": 36 }
```

When the database is unreachable it returns `503` **with a plain-English hint**, naming the
two things that actually happen:

- `database unreachable — check whether the Supabase project is paused`
- `connection pool exhausted — lower DB_POOL_MAX or raise the Supabase pool size`

Live now at `https://warstudio.site/api/health`.

### 3. A backup that exists, verified

`backups/db-2026-11-26.sql.gz` — 28 tables, **12,190 rows**, 756 KB, SHA-256
`404c777f…92aa03`. Every `INSERT` was parsed back and row counts matched table by table.

`scripts/backup-db.py` regenerates it. It writes to a `.partial` file and only renames on
success, so a crash can never leave you a half-written backup that looks valid.

---

## What I got wrong, and corrected

**I said I registered a weekly cron. I did not.** Vercel's project now shows
`crons.definitions: []` — empty.

The cause is our deploy method: each deployment uploads only a marker file, and the real
project arrives via `installCommand`, which runs *after* Vercel has already read the
project configuration. A `vercel.json` cron can never register through that path. The cron
*route* exists and is secured (401 without the secret), but nothing calls it on a schedule.

`vercel.json` now says `"crons": []` so it does not lie. **Use an external monitor
instead — item 2 below.**

---

## What only you can do

### 1. Upgrade Vercel to Pro — $20/month

Not a performance question. On Hobby, commercial use violates ToS §4, and a takedown takes
the casino offline mid-operation with players' money in your ledger. It also removes the
100 GB bandwidth cap that can suspend (not bill) you.

### 2. Set up a free uptime monitor — 5 minutes

Since crons cannot register here, this is how you find out about problems before a player
does.

1. Go to [uptimerobot.com](https://uptimerobot.com) (free, 50 monitors)
2. **Add New Monitor** → type **HTTP(s)**
3. URL: `https://warstudio.site/api/health`
4. Interval: **5 minutes**
5. Alert contacts: your email + phone

It watches for the word `"ok":true`. If the database pauses, the pool exhausts, or the
site goes down, you get a message — not a customer.

Do the same for `https://admin.warstudio.site/`.

### 3. Set two environment variables in Vercel

Settings → Environment Variables:

| Key | Value | Why |
|---|---|---|
| `CRON_SECRET` | any long random string | the backup-check route returns 401 without it |
| `DB_POOL_MAX` | `3` (default) — lower to `2` only if you ever see pool errors | tune without a code change |

### 4. Do the backup once a week

The script cannot run itself from here. Once a week:

```bash
python3 scripts/backup-db.py
```

Then upload `backups/db-<date>.sql.gz` to Google Drive. Two minutes.

**Why this is not optional:** your Supabase plan has **no automatic backups**, and free
projects **pause after one week of inactivity**. Your ledger currently exists in exactly
one place. Today's file is that second place — keep it current.

### 5. Supabase Pro — $25/month, when you have daily players

| | Free | Pro |
|---|---|---|
| Automatic backups | **None** | Daily, 7 days |
| Pausing | **After 1 week idle** | Never |
| Point-in-time recovery | No | Add-on |

You are 21 MB into 500 MB, so storage is not the argument. The argument is *never pauses*
and *backups you do not have to remember*. Until then, item 4 is what protects you.

### 6. Credentials — the quiet single point of failure

- [ ] Change the admin password (`Bdritu` is guessable and is your only admin account)
- [ ] Turn on 2FA for **Vercel** — whoever holds it can deploy any code to your casino
- [ ] Turn on 2FA for **Supabase** and **Cloudflare**
- [ ] Keep an offline copy of `DATABASE_URL`, `JWT_SECRET`, `PAYWISE_API_KEY`,
      `PAYWISE_WEBHOOK_SECRET`. If you lose account access and these are gone, you cannot
      rebuild.

---

## The permanent-ops calendar

| When | What | Time |
|---|---|---|
| **Once now** | Vercel Pro · uptime monitor · 2FA · change admin password · set `CRON_SECRET` | 40 min |
| **Weekly** | `python3 scripts/backup-db.py` → upload to Drive | 2 min |
| **Monthly** | Open `/api/health`, confirm `"ok":true`; check Drive has 4 recent dumps | 1 min |
| **When you get daily players** | Supabase Pro | — |
| **Never** | Migrate to Cloudflare Workers/D1 (see below) | — |

---

## Why staying here is the right permanent answer

| Concern | Reality at your size |
|---|---|
| Database too full | **21 MB of 500 MB — 4%** |
| Bundle too big | 4.1 MB, no limit hit |
| Traffic | pre-scale; the pool fix is the only real limit, now fixed |
| Cost | $20–45/month total, against a ৳500 minimum deposit |

The only thing that genuinely does not scale on free plans is **reliability guarantees**
(pausing, no backups) — and that is exactly what items 1, 2, 4 and 5 buy you.

**Do not migrate to Cloudflare Workers/D1.** Your wallet code depends on Postgres
transactions and 27 `SELECT … FOR UPDATE` row locks. D1 has neither. That is a rewrite of
the money path of a live casino, for zero benefit at 4% database usage.

---

## Fastest sanity check, any time

```bash
curl -s https://warstudio.site/api/health
# {"ok":true,"db":"up","ms":36,...}   <- healthy
# 503 + "hint"                        <- database paused or pool exhausted
```
