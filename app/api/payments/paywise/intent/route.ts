/**
 * PayWise — payment intent without the API.
 *
 * PayWise's API will not create a payment link for this account yet (their gateway
 * rejects the call with `PW_SUBSCRIPTION_KEY_MISSING` at the header layer, and the
 * merchant `pw_live_` key is not that header credential). Until they issue the
 * developer key, this endpoint produces the next best thing:
 *
 *   POST /api/payments/paywise/intent  { channel, amount_cents }
 *     → { ok, request_id, trx_ref: "PW-XXXXXXXX", amount_cents }
 *
 * `trx_ref` is a short human-readable reference. The player sends the money through
 * PayWise (their link / QR / agent / wallet) and types that reference back in. The
 * request sits in `cashier_requests` as PENDING, which means:
 *
 *   • the existing admin approval screen picks it up, and
 *   • if PayWise ever posts a callback carrying this reference, the webhook credits it
 *     automatically without anyone touching the admin panel.
 *
 * Nothing is credited here — an intent is not a payment.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Short, typeable, unambiguous — no 0/O or 1/I to avoid mis-typed references. */
function reference() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `PW-${out}`;
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "PayWise");
  const amountCents = Math.trunc(Number(body.amount_cents));

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "amount_cents must be a positive integer" }, { status: 400 });
  }

  const ch = (await query(
    "SELECT channel, min_amount_cents, max_amount_cents, is_active FROM deposit_channels WHERE channel = $1",
    [channel]
  ))[0] as any;
  if (!ch || !ch.is_active) return NextResponse.json({ ok: false, error: "channel unavailable" }, { status: 400 });
  if (amountCents < Number(ch.min_amount_cents) || amountCents > Number(ch.max_amount_cents)) {
    return NextResponse.json({
      ok: false,
      error: `amount must be between ৳${Number(ch.min_amount_cents) / 100} and ৳${Number(ch.max_amount_cents) / 100}`,
    }, { status: 400 });
  }

  // Retry on the (vanishingly rare) reference collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const trxRef = reference();
    try {
      const rows = await query(
        `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
         VALUES ($1,'DEPOSIT',$2,'PAYWISE REF',$3,$4,'PENDING') RETURNING id`,
        [sess.sub, channel, trxRef, amountCents]
      );
      return NextResponse.json({
        ok: true,
        request_id: Number(rows[0].id),
        trx_ref: trxRef,
        amount_cents: amountCents,
        channel,
      });
    } catch (e: any) {
      // 23505 = unique violation on trx_ref → try another reference
      if (String(e?.code) !== "23505") {
        console.error("[paywise] intent failed", e);
        return NextResponse.json({ ok: false, error: "could not create request" }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ ok: false, error: "could not allocate a reference" }, { status: 500 });
}
