import { NextResponse } from "next/server";
import { getRules } from "@/lib/rules-server";

/**
 * GET /api/rules — every player-facing fee and threshold, from one place.
 *
 * Public on purpose: these are the terms a player agrees to. Cached briefly so
 * a busy lobby doesn't hammer the DB; a fee change shows up within a minute.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await getRules();
  return NextResponse.json(
    { ok: true, rules },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
