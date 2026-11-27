import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";
import { signSession, setSessionCookie, setLastUserCookie, generateReferralCode } from "@/lib/auth";
import { normaliseBdPhone, toIntlBdPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawPhone = String(body.username_or_phone ?? body.username ?? body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const confirmPassword = body.confirm_password === undefined ? undefined : String(body.confirm_password);
  const referral = String(body.referral_code ?? body.ref ?? "").trim().toUpperCase();
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return NextResponse.json(
      { ok: false, error: "Passwords do not match", error_bn: "পাসওয়ার্ড মিলছে না" },
      { status: 400 }
    );
  }

  // Registration is phone-only. +880 / 880 / bare 1XXXXXXXXX / spaces / dashes all
  // normalise to 01XXXXXXXXX, which is the canonical login id.
  const username = normaliseBdPhone(rawPhone);
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid BD mobile number (01XXXXXXXXX)", error_bn: "সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 6 characters", error_bn: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে" },
      { status: 400 }
    );
  }
  const phoneIntl = toIntlBdPhone(username);

  const exists = await query("SELECT id FROM users WHERE username_or_phone = $1 OR phone = $2", [username, phoneIntl]);
  if (exists.length) {
    // Most people hitting this already have an account (or are trying to register
    // with the admin's own number) — point them at login instead of a dead end.
    return NextResponse.json(
      {
        ok: false,
        code: "phone_taken",
        error: "This number already has an account — please log in instead",
        error_bn: "এই নম্বরে অ্যাকাউন্ট আছে — লগইন করুন",
      },
      { status: 409 }
    );
  }

  let referredBy: number | null = null;
  if (referral) {
    const r = await query("SELECT id FROM users WHERE referral_code = $1", [referral]);
    referredBy = r[0]?.id ?? null;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await withTransaction(async (client) => {
    let code = generateReferralCode();
    for (let i = 0; i < 5; i++) {
      const clash = await client.query("SELECT 1 FROM users WHERE referral_code = $1", [code]);
      if (!clash.rows.length) break;
      code = generateReferralCode();
    }
    const ins = await client.query(
      `INSERT INTO users (username_or_phone, password_hash, phone, balance_cents, vip_level, referral_code, referred_by)
       VALUES ($1,$2,$3,0,0,$4,$5) RETURNING id, username_or_phone, balance_cents, currency, vip_level, referral_code, is_admin, created_at, phone`,
      [username, hash, phoneIntl, code, referredBy]
    );
    return ins.rows[0];
  });

  const res = NextResponse.json({ ok: true, user: { ...user, balance_cents: Number(user.balance_cents) } });
  /* a brand-new account is remembered by default — the player just proved the
     phone number, asking again on the next visit would only lose sessions */
  const remember = body.remember !== false;
  setSessionCookie(res, signSession({ sub: Number(user.id), u: user.username_or_phone, adm: user.is_admin }, remember), remember);
  setLastUserCookie(res, user.username_or_phone, remember);
  return res;
}
