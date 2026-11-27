# Setting up the weekly cron — step by step

You found the right screen: **Schedules** (beta on all plans, including Hobby). This is the
way to do it. `vercel.json` is not needed and will not work with how your site deploys.

The route is already live and ready. Two steps, about 4 minutes.

---

## Step 1 — create the secret (2 minutes)

The scheduler calls a URL. The only thing it can carry that a stranger cannot copy is a
secret in that URL, so make one first.

1. Open a browser console (or any password generator) and make a long random string, e.g.:

   ```
   b7k2m9xq4tv8wn3zr6ps1hd5cj0efygu
   ```

2. Vercel → project **`sonali7-casino`** → **Settings** → **Environment Variables**
3. **Add New**
   - Key: `CRON_SECRET`
   - Value: the long string you just made
   - Environments: **Production** (tick it)
4. **Save**, then **redeploy** — environment variables only apply to new deployments.

> Until this exists, the route answers:
> `{"ok":false,"error":"CRON_SECRET is not set — only an admin may run this"}`
> That message is your indicator for whether step 1 worked.

**Keep that string somewhere safe.** You need to paste it into the schedule URL next.

---

## Step 2 — create the schedule (2 minutes)

1. Vercel → project **`sonali7-casino`** → **Schedules** (the screen in your screenshot)
2. **Create your first schedule**
3. Fill it in like this:

| Field | Value |
|---|---|
| **Name** | `weekly-db-check` |
| **Type / Action** | **Call a route** (or "HTTP / GET request" — whichever the form offers) |
| **URL / Path** | `https://warstudio.site/api/cron/backup?token=b7k2m9xq4tv8w...` ← **the same secret from step 1** |
| **Method** | `GET` |
| **Schedule / Expression** | `0 4 * * 1` |
| **Timezone** | `UTC` |

`0 4 * * 1` = every **Monday at 04:00 UTC**, which is **10:00 in Dhaka**.

If the form wants a friendlier format instead of cron syntax, pick **Weekly → Monday →
10:00** and set the timezone to **Asia/Dhaka**. Both end up in the same place.

4. **Create**. It will appear in the list with something like *"in 2d"* next to it.

---

## Step 3 — prove it works without waiting a week (30 seconds)

Don't wait until Monday to find out it is misconfigured. Run it by hand:

```
https://warstudio.site/api/cron/backup?token=YOUR_SECRET
```

Paste that into your phone browser. You should get:

```json
{
  "ok": true,
  "via": "cron-secret-token",
  "counts": { "users": 9, "wallet_ledger": 886, "cashier_requests": 25, ... },
  "ledger": { "rows": 886, "total_cents": 3182935 },
  "balances": { "total_cents": 10184197 }
}
```

If you get `401 unauthorized` → the secret in the URL does not match `CRON_SECRET`.
If you get `CRON_SECRET is not set` → step 1 did not take effect, or you did not redeploy.

### Then check it was recorded

Every run writes a row you can read months later, because Vercel's logs expire but the
database does not:

```sql
SELECT key, value FROM platform_settings WHERE key LIKE 'backup_last%';
```

- `backup_last_check` → when it last ran successfully
- `backup_last_counts` → the full JSON of that run
- `backup_last_error` → created only if a run **failed**

---

## What this job actually does — and what it cannot do

| It does | It does not |
|---|---|
| Confirms the database is readable | Write a dump file anywhere |
| Records row counts for 6 key tables | Store a copy off-site |
| Sums the ledger and total balances | Replace `scripts/backup-db.py` |
| Writes `backup_last_*` so you have a history | Detect a wrong-but-consistent balance |

A scheduled HTTP call has no disk you can keep. **So the weekly 2 minutes stays:**

```bash
python3 scripts/backup-db.py
```

then upload `backups/db-<date>.sql.gz` to Google Drive.

The schedule is the smoke alarm. The script is the insurance policy. You need both.

---

## A warning about where the token lives

`?token=...` ends up in Vercel's **request logs**, which is why the value should be a
dedicated random string used for nothing else — never your database password, never your
JWT secret. If it ever leaks, the worst a stranger can do is make your site count its own
rows once. Still, change it if you suspect it is exposed: update the environment variable,
redeploy, and paste the new value into the schedule URL.

*(This is also why the route stopped accepting Vercel's `x-vercel-cron` header: any curl
user could send that header themselves. It is rejected now — verified in production, 401.)*

---

## Two things I noticed in your project while doing this

1. **The project is now linked to a GitHub repo** — `warstudiobd/LotChat`, production branch
   `main`. That appeared since my last check. This means a push to `main` will now trigger a
   deploy **of that repo's contents**, which is *not* how your site is live today (it deploys
   from a tarball in Drive). Until those two agree, a push could replace your live site with
   whatever is in that repo. Worth checking before you push anything.

2. **`cleanup`, `daily-digest`, `trial-reminder`, `sitemap-refresh`** in your screenshot are
   Vercel's example schedules for a demo project — they are not yours. Ignore them; only
   `weekly-db-check` matters.
