/**
 * Liveness probe — answers one question: is the site able to reach its database?
 *
 * This is the early-warning system for the two failure modes that would otherwise be
 * discovered by a player:
 *
 *   - the Supabase project paused (free plans pause after a week of idle)
 *   - the connection pool exhausted ("too many clients already")
 *
 * It is deliberately cheap (one SELECT 1, no table reads) so it can be polled every
 * minute by a free uptime monitor without costing anything.
 *
 * Public on purpose, and safe to be public: it exposes no data, no counts, no
 * configuration — only whether the database answered and how long it took. Knowing
 * that a casino's database is up is not useful to an attacker.
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await query("SELECT 1");
    return NextResponse.json(
      { ok: true, db: "up", ms: Date.now() - started, at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    /* The two messages worth naming, because each has a completely different fix and
       neither is obvious from the raw error. */
    const hint = /too many clients|remaining connection slots/i.test(msg)
      ? "connection pool exhausted — lower DB_POOL_MAX or raise the Supabase pool size"
      : /terminat|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)
        ? "database unreachable — check whether the Supabase project is paused"
        : undefined;

    return NextResponse.json(
      { ok: false, db: "down", error: msg.slice(0, 200), hint, ms: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
