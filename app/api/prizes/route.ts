/**
 * GET /api/prizes — everything the festival prize page shows (v51).
 * Public: winners are visible to a logged-out visitor; personal numbers are not.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { loadPromoState } from "@/lib/promo";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId().catch(() => null);
  const userId = sess ? Number(sess.sub) : null;
  try {
    const state = await loadPromoState(userId);
    return NextResponse.json(state);
  } catch (e) {
    console.error("[prizes] failed", e);
    return NextResponse.json({ ok: false, error: "prize centre unavailable" }, { status: 500 });
  }
}
