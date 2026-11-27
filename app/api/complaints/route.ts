/** Player complaints — submit a new one; list own. Auth required. */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim().slice(0, 80);
  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (subject.length < 3) return NextResponse.json({ ok: false, error: "subject too short" }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ ok: false, error: "message too short (min 10 chars)" }, { status: 400 });

  const u = await query("SELECT is_blocked FROM users WHERE id = $1", [sess.sub]);
  if (u[0]?.is_blocked) return NextResponse.json({ ok: false, error: "account blocked" }, { status: 403 });

  const rows = await query(
    "INSERT INTO complaints (user_id, subject, message) VALUES ($1,$2,$3) RETURNING id, status, created_at",
    [sess.sub, subject, message]
  );
  return NextResponse.json({ ok: true, complaint: { ...rows[0], id: Number(rows[0].id) } });
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await query(
    "SELECT id, subject, message, status, admin_note, created_at, updated_at FROM complaints WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [sess.sub]
  );
  return NextResponse.json({ ok: true, complaints: rows.map(r => ({ ...r, id: Number(r.id) })) });
}
