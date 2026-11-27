/**
 * PayWise — catch-up check for a deposit the player just returned from.
 *
 *   POST /api/payments/paywise/status   { trx_ref: "PW-AB12CD" }
 *     → { ok, status: "pending"|"paid"|"failed"|"expired"|"unpaid", credited }
 *
 * Why this exists: the webhook is the source of truth, but a player who has paid and
 * comes back deserves an answer within seconds, not on PayWise's retry schedule.
 * This asks PayWise for the transaction behind our reference and, if it is paid,
 * credits through the same idempotent path the webhook uses — so whichever arrives
 * first wins and the second is a no-op.
 *
 * Only the signed-in owner of the request may ask. Nothing is ever credited from the
 * client's word, only from PayWise's own answer.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { findTransactionByMerchantReference, isConfigured } from "@/lib/paywise";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/credit-pending";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const trxRef = String(body.trx_ref ?? "").trim();
  if (!trxRef) return NextResponse.json({ ok: false, error: "trx_ref required" }, { status: 400 });

  const cr = (await query(
    "SELECT id, user_id, status FROM cashier_requests WHERE trx_ref = $1",
    [trxRef]
  ))[0] as any;
  if (!cr) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  if (Number(cr.user_id) !== Number(sess.sub)) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  // Already settled: report the truth and stop (no PayWise call needed).
  if (cr.status === "APPROVED") return NextResponse.json({ ok: true, status: "paid", credited: true });
  if (cr.status === "REJECTED") return NextResponse.json({ ok: true, status: "failed", credited: false });

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, status: "unpaid", credited: false, note: "PAYWISE_API_KEY not set" });
  }

  // PayWise knows the transaction by its own reference; ours is merchant_reference.
  const remote = await findTransactionByMerchantReference(trxRef);
  if (!remote) {
    return NextResponse.json({ ok: true, status: "unpaid", credited: false });
  }

  // A gateway "pending" that has passed its own expiry can never complete. PayWise
  // only ever pushes `payment.expired` for crypto, never for the BDT wallet rail, so a
  // wallet deposit used to sit PENDING forever. Closing it here keeps the history honest
  // and lets the player simply start a fresh one.
  const expiredAt = String(remote.transaction!.expires_at || "");
  const remoteStatus = String(remote.transaction!.status || "").toLowerCase();
  if (remoteStatus === "pending" && expiredAt) {
    const gone = new Date(expiredAt).getTime();
    if (Number.isFinite(gone) && gone < Date.now()) {
      await rejectPendingDeposit(trxRef);
      return NextResponse.json({ ok: true, status: "expired", credited: false });
    }
  }

  if (remote.transaction!.status === "paid") {
    const outcome = await creditPendingDeposit(trxRef);
    return NextResponse.json({
      ok: true,
      status: "paid",
      credited: outcome === "credited" || outcome === "already",
      outcome,
    });
  }

  if (["failed", "expired"].includes(remote.transaction!.status)) {
    await rejectPendingDeposit(trxRef);
    return NextResponse.json({ ok: true, status: remote.transaction!.status, credited: false });
  }

  return NextResponse.json({ ok: true, status: "pending", credited: false });
}
