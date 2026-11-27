# Costs, and the honest status of the weekly cron

_Measured 2026-11-26. Prices are monthly unless stated._

---

## Part 1 — What everything costs

### The minimum I would run this on

| Item | Plan | Cost | Why it is not optional |
|---|---|---|---|
| Vercel | **Pro** | **$20** | Hobby forbids commercial use (ToS §4). A takedown takes the casino offline. |
| Supabase | Free | $0 | 21 MB of 500 MB. Fine *while you back up manually.* |
| Cloudflare | Free | $0 | DNS, DDoS, SSL, Bot Fight Mode — all free. |
| UptimeRobot | Free | $0 | 50 monitors, 5-minute checks. |
| Domain | already owned | $0 | at Cloudflare |
| **Total** | | **$20/mo** | ≈ **৳2,400/month** |

That is the honest floor. Everything below is judgement, not requirement.

### Recommended once you have real daily players

| Item | Plan | Cost | What it buys |
|---|---|---|---|
| Supabase | **Pro** | **$25** | Never pauses · **daily automatic backups (7-day retention)** · 7-day logs |
| **Total** | | **$45/mo** | ≈ **৳5,400/month** |

### Optional, only when you actually need them

| Item | Cost | Trigger to buy it |
|---|---|---|
| Supabase PITR (point-in-time recovery) | ~$100/mo add-on | You have thousands of players and cannot lose even an hour |
| Vercel Pro extra seats | $20/seat | A second operator needs dashboard access |
| Cloudflare Pro | $20 | You want WAF rules — *not needed*, Bot Fight Mode is free |
| Sentry (error tracking) | $0–26 | You want to see JS errors from players' phones |
| Play provider | per their contract | already live |

### What your actual usage costs — the truth

You are far below every limit:

| Resource | You use | Free/Pro allowance |
|---|---|---|
| Database | **21 MB** | 500 MB (free) / 8 GB (pro) |
| Server bundle | 4.1 MB | — |
| Deploy size | 5 MB, 829 files | — |
| Players | 10 | — |
| Ledger rows | 887 | — |

**Nothing you are paying for is caused by usage.** The $20 is purely the licence to trade,
and the $25 is purely "don't pause, do back up." If someone quotes you hundreds of dollars
a month for this app at this size, they are selling you capacity you do not need.

### Annualised

| Setup | Per month | Per year |
|---|---|---|
| Minimum (Vercel Pro only) | $20 | **$240** ≈ ৳28,800 |
| Recommended | $45 | **$540** ≈ ৳64,800 |

Against a ৳500 minimum deposit, the recommended stack needs **108 deposits a year** to
cover itself. That is the number to judge it by.

---

## Part 2 — The weekly cron: what actually happened

I have to be straight with you, because I have now claimed this twice.

### Where it stands

| Attempt | Result |
|---|---|
| 1. `vercel.json` in the project folder, deployed normally | ❌ `crons.definitions: []` — never registered |
| 2. `vercel.json` embedded in the deployment payload | ❌ build failed: `invalid_vercel_json` |

**The cron is not running. It is not scheduled.** I will not tell you otherwise.

### Why it cannot be fixed from where I sit

Your deployments do not upload the project. They upload a **marker file**, and the real
4.9 MB project arrives via `installCommand` (a `curl` from Google Drive), which Vercel runs
**after** it has already read the project configuration. So:

- `vercel.json` placed inside the tarball → arrives too late, never read.
- `vercel.json` placed in the upload payload → read, but this connector cannot deliver JSON
  content reliably: it either sends the value as a non-string (Vercel rejects with
  `files[].data should be string`) or writes the quotes literally (Vercel rejects with
  `invalid_vercel_json`). I proved both.

There is no third path through this tool. The route itself **does** exist and is secured —
`https://warstudio.site/api/cron/backup` returns **401**, which proves it is deployed and
refusing strangers.

### Two ways to actually get the weekly cron — pick one

**Option A — you add it in the dashboard (2 minutes, no deploy)** ⭐ recommended

1. Vercel dashboard → project **`sonali7-casino`** → **Settings** → **Cron Jobs**
2. **Create Cron Job**
   - Path: `/api/cron/backup`
   - Schedule: `0 4 * * 1` (every Monday, 04:00 UTC = 10:00 Dhaka)
3. Save

That is it. The route is already deployed, already authentication-aware, and it will start
reporting row counts every Monday. **This is the only method that works with how your site
is deployed today.**

**Option B — make the backup a separate GitHub Action (no Vercel involvement)**

Put a workflow in the repo that runs `python3 scripts/backup-db.py` weekly and uploads the
dump to Google Drive or an S3 bucket. This is strictly better than a cron anyway, because it
produces a **downloadable file off-site**, which a Vercel cron cannot do — a cron can only
poke a URL.

`scripts/backup-db.py` is already written and tested for this. Say the word and I will
generate the workflow file.

### What the cron does and does not do — so the name does not mislead you

| It does | It does not |
|---|---|
| Verifies the database is readable | Write a dump file anywhere |
| Records row counts for 6 key tables | Store a copy off-site |
| Sums the ledger and total balances | Detect a *logical* error (a wrong balance that still adds up) |
| Returns 500 with the reason if the DB is unreachable | Replace `scripts/backup-db.py` |

**So even with the cron fixed, your weekly 2-minute job stays:** run the script, upload the
file to Drive. The cron is the smoke alarm; the script is the insurance policy.

---

## Part 3 — What is protecting you right now

| Protection | Status |
|---|---|
| Connection-pool fix (the crash-at-scale bug) | ✅ live, 20 concurrent requests verified |
| `/api/health` probe with plain-English failure hints | ✅ live, `{"ok":true,"db":"up","ms":35}` |
| Cron **route** deployed and auth-gated | ✅ 401 without credentials |
| Cron **schedule** | ❌ **not registered — needs your 2 minutes** |
| Full database dump, verified restorable | ✅ `backups/db-2026-11-26.sql.gz`, 12,190 rows |
| Automatic off-site backup | ❌ none — weekly manual until you upgrade Supabase |
| 16/16 pages healthy after every change today | ✅ |

---

## The four things that cost you nothing and you should do today

1. **Vercel → Settings → Cron Jobs → add `/api/cron/backup` on `0 4 * * 1`** (2 min)
2. **Set `CRON_SECRET`** in Vercel env vars (1 min)
3. **Download `backups/db-2026-11-26.sql.gz`** and put it in your Google Drive (2 min)
4. **Turn on 2FA** for Vercel, Supabase and Cloudflare (10 min)
