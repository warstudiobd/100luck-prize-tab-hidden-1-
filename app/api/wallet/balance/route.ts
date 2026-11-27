import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await query("SELECT balance_cents, currency, vip_level FROM users WHERE id = $1", [sess.sub]);
  if (!rows[0]) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  return NextResponse.json({ ok: true, balance_cents: Number(rows[0].balance_cents), currency: rows[0].currency, vip_level: rows[0].vip_level });
}
