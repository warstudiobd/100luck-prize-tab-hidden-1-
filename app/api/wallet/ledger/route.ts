import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await query(
    `SELECT id, call_id, provider_code, game_code, action_type, tx_subtype, amount_cents,
            balance_before_cents, balance_after_cents, created_at
     FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
    [sess.sub]
  );
  return NextResponse.json({ ok: true, entries: rows.map(r => ({ ...r, amount_cents: Number(r.amount_cents), balance_before_cents: Number(r.balance_before_cents), balance_after_cents: Number(r.balance_after_cents) })) });
}
