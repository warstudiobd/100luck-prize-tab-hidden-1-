/**
 * Withdrawal PIN.
 *
 *   GET  → { set, locked } — whether the player has a PIN yet, so the UI knows whether to
 *          ask for a new one or an existing one.
 *   POST → { pin, current_pin? } — create it (first time) or change it (needs current_pin).
 *
 * The PIN itself is only ever stored as a bcrypt hash; no endpoint returns it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getPinState, setPin, MAX_FAILURES, LOCK_MINUTES } from "@/lib/withdraw-pin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const state = await getPinState(Number(sess.sub)).catch(() => ({ set: false, locked: false }));
  return NextResponse.json({ ok: true, ...state, max_failures: MAX_FAILURES, lock_minutes: LOCK_MINUTES });
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pin = String(body.pin ?? "").trim();
  const currentPin = body.current_pin === undefined ? undefined : String(body.current_pin).trim();

  const res = await setPin(Number(sess.sub), pin, currentPin);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error, code: res.code }, { status: res.code === "pin_wrong" ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, set: true });
}
