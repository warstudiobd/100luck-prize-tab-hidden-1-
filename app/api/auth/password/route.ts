import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

/** Change the caller's own password. Verifies the current password first. */
export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const current = String(body.current_password ?? "");
  const next = String(body.new_password ?? "");
  if (!current || !next) {
    return NextResponse.json({ ok: false, error: "current_password and new_password are required" }, { status: 400 });
  }
  if (next.length < 6) {
    return NextResponse.json({ ok: false, error: "New password must be at least 6 characters" }, { status: 400 });
  }
  const rows = await query("SELECT id, password_hash FROM users WHERE id = $1", [sess.sub]);
  const u = rows[0];
  if (!u) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  const ok = await bcrypt.compare(current, u.password_hash);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Current password is incorrect" }, { status: 403 });
  }
  const hash = await bcrypt.hash(next, 10);
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, sess.sub]);
  return NextResponse.json({ ok: true });
}
