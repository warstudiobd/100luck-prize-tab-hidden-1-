import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone ?? "").trim();
  if (!PHONE_RE.test(phone)) return NextResponse.json({ ok: false, error: "Enter phone in international format, e.g. +8801XXXXXXXXX" }, { status: 400 });
  const clash = await query("SELECT id FROM users WHERE phone = $1 AND id <> $2", [phone, sess.sub]);
  if (clash.length) return NextResponse.json({ ok: false, error: "Phone number already registered" }, { status: 409 });
  const rows = await query(
    `UPDATE users SET phone = $2 WHERE id = $1
     RETURNING id, username_or_phone, balance_cents, currency, vip_level, referral_code, is_admin, created_at, phone`,
    [sess.sub, phone]
  );
  const u = rows[0];
  if (!u) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  return NextResponse.json({ ok: true, user: { ...u, id: Number(u.id), balance_cents: Number(u.balance_cents) } });
}
