# What you need to keep everything where it is

Your stack today: **Vercel** (hosting) + **Supabase** (database) + **Cloudflare** (DNS).
All three are the right choice for now. This is the checklist of what keeping them
requires — with your real numbers, not generic advice.

---

## Your size, measured today

| Thing | Actual |
|---|---|
| Database | **21 MB** of a 500 MB free limit (4% used) |
| Biggest table | `games_catalog`, 10,764 rows |
| Money rows | 887 ledger entries · 27 cashier requests · 10 players |
| Server bundle | 4.1 MB gzipped |
| Deploy size | ~5 MB, 823 files |
| Traffic risk | none yet — you are pre-scale |

You are tiny. The database will take years to fill 500 MB at this rate. **Storage is not
your problem; reliability and legality are.**

---

## 1. Do this first: backup, because you currently have none

**The single most dangerous thing in your setup:** your Supabase plan includes **no
automatic backups**, and free projects **pause after one week of inactivity**. A paused
project does *not* wake up on its own — your site is offline until you restore it from
the dashboard.

Your entire casino ledger exists in exactly one place. That is the finding that matters.

### Already done for you

| Item | Status |
|---|---|
| Full logical dump taken | ✅ `backups/db-2026-11-26.sql.gz` — 28 tables, **12,190 rows**, 756 KB |
| Dump verified restorable | ✅ every INSERT parsed, row counts matched per table, ends with `COMMIT` |
| SHA-256 for integrity | ✅ `404c777f…92aa03` |
| `scripts/backup-db.py` | ✅ reusable, refuses to leave a half-written file |
| Weekly health check route | ✅ `/api/cron/backup`, registered in `vercel.json` (Mondays 04:00) |
| Route secured | ✅ 401 without the secret — verified |

### What you must do

1. **Download the dump to your own computer** and keep a second copy somewhere that
   is not Supabase (Google Drive is fine, you already have it connected).
   The file is at `backups/db-2026-11-26.sql.gz` in this workspace.
2. **Set `CRON_SECRET`** in Vercel → Settings → Environment Variables → any long random
   string. Without it the cron route returns 401 and does nothing.
3. **Run a real backup weekly.** The cron only *checks* row counts — it cannot write a
   file anywhere by itself. One command, once a week:

   ```bash
   python3 scripts/backup-db.py
   ```

   Then upload the new `backups/db-<date>.sql.gz` to Drive.

**Restoring, if you ever need to:** `gunzip -c backups/db-2026-11-26.sql.gz | psql "$DATABASE_URL"`

---

## 2. Upgrade Vercel to Pro — $20/month

Not optional. Two reasons, in order of severity:

- **Legally:** Vercel's Hobby plan forbids commercial use (ToS §4). You are taking real
  ৳ through this site. A takedown would take the whole casino offline mid-operation.
- **Technically:** Hobby has a 100 GB/month bandwidth cap with soft suspension, and no
  team access. One viral day and you are suspended, not billed.

$20/month against a single ৳500 deposit is not a cost, it is insurance.

---

## 3. Supabase: the decision you need to make

You can stay free. But know exactly what free means:

| | Free | Pro ($25/mo) |
|---|---|---|
| Automatic backups | **None** | Daily, 7-day retention |
| Pausing | **After 1 week idle** | Never |
| Log retention | 1 day | 7 days |
| Point-in-time recovery | No | Paid add-on |

**My recommendation: stay on Free for now, but only because you now have a manual backup
routine.** The moment you have real daily players, the $25 is worth it purely for
"never pauses" and "daily backups you did not have to think about."

If you stay free, the activity is self-sustaining — your site queries the database on
every page load, so it will not idle for a week while players are active. The danger is a
**quiet period**, which right now is exactly your situation.

---

## 4. Cloudflare: keep it for DNS, and turn on these free things

You do not need to pay Cloudflare anything. In the Cloudflare dashboard:

| Setting | Where | Why |
|---|---|---|
| **Grey cloud (DNS only) on `@`, `www`, `admin`** | DNS → Records | Or Vercel cannot issue TLS — see `DOMAIN-SETUP.md` |
| **SSL/TLS → Full (strict)** | SSL/TLS → Overview | "Flexible" causes an endless redirect loop |
| **Always Use HTTPS → On** | SSL/TLS → Edge Certificates | free |
| **Bot Fight Mode → On** | Security → Bots | free, stops credential-stuffing on your login |
| **Under Attack Mode** (leave OFF until needed) | Security | your emergency brake if you get hit |
| **Enable DNSSEC** | DNS → Settings | free, stops domain spoofing |

---

## 5. Credentials and access — the quiet risk

Nothing here is on fire, but each is a single point of failure:

- [ ] **Change the admin password.** `Bdritu` is a guessable username and it is the only
      admin account. Use a long random password and put it in a password manager.
- [ ] **Two-factor on the Vercel account.** The Vercel account can deploy any code; if it
      is compromised, the casino is gone. Turn on 2FA now.
- [ ] **Two-factor on Supabase and Cloudflare** too — same reasoning.
- [ ] **Turn on Supabase's leaked-password protection** in Auth settings.
- [ ] **Store the secrets somewhere other than the code.** `DATABASE_URL`,
      `PAYWISE_API_KEY`, `PAYWISE_WEBHOOK_SECRET`, `JWT_SECRET` live in Vercel env vars —
      correct — but you should have an offline copy of them, or you cannot rebuild if you
      lose account access.

---

## 6. Two things that will bite you regardless of hosting

**Payouts are still blocked.** PayWise returns `403 WITHDRAW_NOT_ENABLED` until you enable
withdrawals on their **API Keys** page, and your merchant BDT balance is ৳472.50 against
their own ৳500 rail minimum. No hosting decision changes this — it is the one thing
currently stopping you from paying a player automatically.

**Automatic payouts cover exactly ৳500.** Since today's floor change, the auto-payout
ceiling (৳500) equals the minimum (৳500). Only a straight ৳500 request pays out
automatically; everything larger waits for your manual approval. That is safe, but it is
probably not what you want long term — tell me a ceiling when you have done 2–3 payouts
by hand.

---

## 7. The order I would do it in

| # | Action | Cost | Time |
|---|---|---|---|
| 1 | Set `CRON_SECRET`, download today's dump to Drive | ৳0 | 5 min |
| 2 | Vercel → Pro | $20/mo | 5 min |
| 3 | 2FA on Vercel, Supabase, Cloudflare; change admin password | ৳0 | 15 min |
| 4 | Cloudflare: grey cloud, Full(strict), Bot Fight Mode | ৳0 | 10 min |
| 5 | Connect the new domain (see `DOMAIN-SETUP.md`) | ৳0 | 20 min |
| 6 | Weekly: run `scripts/backup-db.py`, upload to Drive | ৳0 | 2 min/week |
| 7 | Enable PayWise withdrawals; fund merchant balance past ৳500 | depends | — |
| 8 | Revisit Supabase Pro once you have daily players | $25/mo | later |

---

## What you do NOT need to do

- **Do not migrate to Cloudflare Workers/D1.** Your wallet code depends on Postgres
  transactions and 27 `SELECT … FOR UPDATE` row locks. D1 does not have them. That is a
  rewrite of the money path of a live casino, for no benefit at your size.
- **Do not move the database.** Supabase is not your bottleneck; it is 4% full.
- **Do not buy more compute.** 4.1 MB bundle, pre-scale traffic — nothing is constrained
  except the items in this list.
