import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { signSession, setSessionCookie, setLastUserCookie } from "@/lib/auth";
import { normaliseBdPhone, toIntlBdPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username_or_phone ?? body.username ?? "").trim();
  const password = String(body.password ?? "");
  /* v55: "remember me" — 400 days when ticked, this sitting only (12 h) when not.
     Absent means unticked, so an old client can never accidentally get a long session. */
  const remember = body.remember === true || body.remember === "1" || body.remember === 1;
  if (!username || !password) return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

  // Accept the number however it is typed, and match the phone column too so
  // accounts created by seed/admin (username "Bdritu", phone +880…) can log in
  // with their phone number.
  const local = normaliseBdPhone(username);
  const candidates = [username];
  if (local) candidates.push(local, toIntlBdPhone(local));
  const rows = await query(
    "SELECT * FROM users WHERE username_or_phone = ANY($1::text[]) OR phone = ANY($1::text[]) LIMIT 1",
    [candidates]
  );
  const u = rows[0];
  const ok = u ? await bcrypt.compare(password, u.password_hash) : false;
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Invalid phone number or password", error_bn: "নম্বর বা পাসওয়ার্ড ভুল" },
      { status: 401 }
    );
  }
  if (u.is_blocked) return NextResponse.json({ ok: false, error: "account_blocked", message: "এই অ্যাকাউন্টটি ব্লক করা হয়েছে — সাপোর্টের সাথে যোগাযোগ করুন। / This account has been blocked — contact support." }, { status: 403 });

  const res = NextResponse.json({ ok: true, remember, user: { id: Number(u.id), username_or_phone: u.username_or_phone, balance_cents: Number(u.balance_cents), currency: u.currency, vip_level: u.vip_level, referral_code: u.referral_code, is_admin: u.is_admin, created_at: u.created_at, phone: u.phone ?? null } });
  setSessionCookie(res, signSession({ sub: Number(u.id), u: u.username_or_phone, adm: u.is_admin }, remember), remember);
  setLastUserCookie(res, u.username_or_phone, remember);
  return res;
}
