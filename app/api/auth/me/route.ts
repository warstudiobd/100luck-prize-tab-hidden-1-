import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: true, user: null });
  const rows = await query(
    "SELECT id, username_or_phone, balance_cents, currency, vip_level, referral_code, is_admin, created_at, phone, is_blocked FROM users WHERE id = $1",
    [sess.sub]
  );
  const u = rows[0];
  if (!u) return NextResponse.json({ ok: true, user: null });
  if (u.is_blocked) return NextResponse.json({ ok: false, error: "account_blocked", user: null }, { status: 403 });
  const { is_blocked, ...pub } = u;
  return NextResponse.json({ ok: true, user: { ...pub, id: Number(u.id), balance_cents: Number(u.balance_cents) } });
}
