/** Legacy ticket route retired. Red Envelope now uses free deposit-earned plays. */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: false, code: "legacy_ticket_retired", error: "Paid and wager-based tickets are disabled. Use the free deposit-earned Red Envelope play." }, { status: 410 });
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await query(
    "SELECT COUNT(*)::int AS n FROM prize_game_credits WHERE user_id = $1 AND game_key = 'envelope' AND redeemed_at IS NULL",
    [Number(sess.sub)]
  );
  return NextResponse.json({ ok: true, earned: Number((rows as any[])[0]?.n ?? 0), taken: 0, available: Number((rows as any[])[0]?.n ?? 0) });
}
