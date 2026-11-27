/**
 * Weekly database health check, triggered from Vercel (Cron Jobs, Schedules, or a manual run).
 *
 * WHY THIS EXISTS
 * The database is on a plan with NO automatic backups, and the free tier pauses a project
 * after a week of inactivity. A casino ledger that exists in exactly one place is one
 * mistake away from losing every player's balance. This route runs on a schedule and writes
 * a durable record of what it saw, so "was the database healthy last Monday?" is answerable
 * later instead of being a guess.
 *
 * It writes the result to platform_settings (`backup_last_check` / `backup_last_counts`)
 * because serverless logs expire. A row in the database is something you can read from the
 * admin panel months later.
 *
 * WHAT IT DOES NOT DO
 * It cannot write a dump file anywhere — a scheduled HTTP call has no ~ you can keep. The
 * downloadable dump comes from scripts/backup-db.py. This route is the smoke alarm; that
 * script is the insurance policy. See BACKUP.md.
 *
 * SCHEDULING
 * vercel.json declares a static schedule named `weekly-db-check` that targets this path with
 * requestMethod GET, Mondays 04:00 UTC. A static schedule is registered when the deployment
 * becomes current, so there is nothing to click in the dashboard. A path target defaults to
 * POST, which is why requestMethod is pinned to GET here — without it the scheduler would
 * POST and this route would answer 405.
 *
 * SECURITY
 * The scheduler calls a URL, so the only unforgeable thing it can carry is a secret in that
 * URL. Two ways in, both requiring CRON_SECRET to be set in the environment:
 *
 *   1. Authorization: Bearer <CRON_SECRET>     (Vercel's scheduler sends this automatically)
 *   2. ?token=<CRON_SECRET>                    (for a browser or an external pinger)
 *
 * plus a signed-in admin, so you can run it by hand without waiting a week.
 *
 * A `x-vercel-cron` header is NOT accepted: any curl user can set that header themselves,
 * which would let a stranger write rows into your settings table on demand. If CRON_SECRET
 * is unset the route refuses everyone except admins.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

/** Tables whose row count is worth recording: a sudden drop is the signal that something
 *  destroyed data, and it is visible from this one number. */
const WATCH = [
  "users",
  "wallet_ledger",
  "cashier_requests",
  "webhook_events",
  "games_catalog",
  "platform_settings",
];

export async function GET(req: NextRequest) {
  return run(req);
}

/* The scheduler may call with POST (a path target defaults to POST); support both so the
   method never decides whether the check runs. */
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  const token = new URL(req.url).searchParams.get("token") || "";

  let authorized = false;
  let via = "none";

  /* Constant-time-ish comparison: length check first, then a byte compare. A secret in a
     URL is already the weakest part of this design; do not also leak it through timing. */
  const same = (a: string, b: string) => {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };

  if (secret && same(auth, `Bearer ${secret}`)) { authorized = true; via = "cron-secret-header"; }
  else if (secret && same(token, secret)) { authorized = true; via = "cron-secret-token"; }
  else {
    /* Allow a signed-in admin to trigger it by hand. Wrapped, because this route must keep
       working even if admin auth is broken. */
    try {
      const res = await resolveAdminResult(req);
      if (res.ok) { authorized = true; via = "admin"; }
    } catch { /* fall through to 401 */ }
  }

  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: secret ? "unauthorized" : "CRON_SECRET is not set — only an admin may run this" },
      { status: 401 }
    );
  }

  const started = Date.now();
  const counts: Record<string, number> = {};

  try {
    for (const t of WATCH) {
      const [row] = await query(`SELECT COUNT(*)::bigint AS n FROM ${t}`);
      counts[t] = Number(row?.n ?? 0);
    }

    /* A backup proves nothing unless the money adds up. Sum the ledger so the record
       carries the figure you can compare week to week. */
    const [sum] = await query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS s, COUNT(*)::int AS n FROM wallet_ledger`
    );
    const [bal] = await query(
      `SELECT COALESCE(SUM(balance_cents), 0)::bigint AS s FROM users`
    );

    const result = {
      ok: true,
      checked_at: new Date().toISOString(),
      ms: Date.now() - started,
      via,
      counts,
      ledger: { rows: Number(sum?.n ?? 0), total_cents: Number(sum?.s ?? 0) },
      balances: { total_cents: Number(bal?.s ?? 0) },
    };

    /* Durable record. Logs expire in minutes to days; this does not. */
    await setSetting("backup_last_check", result.checked_at).catch(() => {});
    await setSetting("backup_last_counts", JSON.stringify(result)).catch(() => {});

    return NextResponse.json(result);
  } catch (e: any) {
    const message = String(e?.message || e).slice(0, 300);

    /* Record the failure too — a check that silently fails is worse than no check. */
    await setSetting("backup_last_error", JSON.stringify({
      at: new Date().toISOString(), error: message, counts,
    })).catch(() => {});

    /* Never swallow this: a failed backup check is the alarm, not an inconvenience. */
    return NextResponse.json({ ok: false, error: message, counts, via }, { status: 500 });
  }
}
