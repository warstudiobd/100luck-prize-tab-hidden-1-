/** Legacy status endpoint; report free-deposit entitlement only, never a play fee. */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [rows, balanceRows] = await Promise.all([
    query("SELECT COUNT(*)::int AS n FROM lucky_wheel_credits WHERE user_id = $1 AND spin_id IS NULL", [sess.sub]).catch(() => [{ n: 0 }] as any[]),
    query("SELECT balance_cents FROM users WHERE id = $1", [sess.sub]).catch(() => [{ balance_cents: 0 }] as any[]),
  ]);
  return NextResponse.json({ ok: true, can_spin: Number(rows[0]?.n ?? 0) > 0,
    spins_available: Number(rows[0]?.n ?? 0), prize_cents: 600, fee_cents: 0,
    balance_cents: Number(balanceRows[0]?.balance_cents ?? 0), today: null });
}
