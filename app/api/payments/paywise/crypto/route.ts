/**
 * PayWise — crypto deposit (USDT / BTC / ETH / BNB / TRX / SOL / LTC).
 *
 *   POST /api/payments/paywise/crypto   { coin: "USDT", amount_usdt: 10 }
 *     → { ok, trx_ref, coin, network, pay_address, pay_amount, checkout_url, … }
 *
 * Why this route exists: the merchant account is **not** approved for the BDT rails yet
 * (PayWise answers `PAYMENT_METHOD_NOT_APPROVED` for bKash / Nagad / Upay), but the crypto
 * rail is already switched on — a live `POST /transactions` with USDT answers 201 and
 * returns a BEP20 address plus the exact figure to send. So the deposit screen offers the
 * one payment method PayWise really gives this merchant today.
 *
 * The amount the player types is USDT; PayWise adds its own fee and returns `pay_amount`,
 * which is what must actually arrive. Both are shown, never only the nice one.
 *
 * Nothing is credited here. The signed webhook (or "check payment") does that, matching
 * `merchant_reference = trx_ref` exactly like the card/wallet flow.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl, getReturnUrl } from "@/lib/site-url";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { createCryptoTransaction, isConfigured } from "@/lib/paywise";

export const dynamic = "force-dynamic";

/**
 * Coins this merchant can actually take today.
 *
 * PayWise's public API only implements USDT (BEP20) for deposits — BTC/ETH/TRX/SOL/LTC
 * answer `VALIDATION_ERROR: The selected payment method is invalid`, and USDT requires
 * `network: BEP20`. Verified live against the production key, so the picker offers only
 * what really works instead of a row of dead coins.
 */
/** Operator decision (2026-11-26): crypto keeps its own floor of 1 USDT and is
 *  NOT tied to the ৳500 wallet minimum — a USDT amount is not a Taka amount, and
 *  pegging it to the exchange rate would silently drift. Keep this the single
 *  source for the crypto floor; the deposit screen copies it into its copy. */
export const CRYPTO_MIN_USDT = 1;

const COINS: Record<string, { method: string; network: string; label: string; min: number }> = {
  USDT: { method: "USDT", network: "BEP20", label: "USDT · BEP20", min: CRYPTO_MIN_USDT },
};

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
  const coinKey = String(body.coin ?? "USDT").toUpperCase();
  const coin = COINS[coinKey];
  if (!coin) return NextResponse.json({ ok: false, error: "unsupported coin", message: `PayWise cannot take ${coinKey}` }, { status: 400 });

  const usdt = Number(body.amount_usdt);
  if (!Number.isFinite(usdt) || usdt < CRYPTO_MIN_USDT || usdt > 100000) {
    return NextResponse.json({ ok: false, error: "bad amount", message: "amount must be between 1 and 100,000 USDT" }, { status: 400 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "paywise_not_configured", message: "PAYWISE_API_KEY is missing in Vercel" }, { status: 503 });
  }

  // PENDING row first, so the webhook always has a row to find.
  let trxRef = "";
  let requestId = 0;
  for (let attempt = 0; attempt < 5 && !requestId; attempt++) {
    const candidate = reference();
    try {
      const rows = await query(
        `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
         VALUES ($1,'DEPOSIT','PayWise',$2,$3,$4,'PENDING') RETURNING id`,
        // The ledger is poisha; for a crypto deposit we store the USDT figure in cents
        // (10 USDT → 1000) purely as the record of what the player asked for.
        [sess.sub, `${coin.method} CRYPTO`, candidate, Math.round(usdt * 100)]
      );
      requestId = Number(rows[0].id);
      trxRef = candidate;
    } catch (e: any) {
      if (String(e?.code) !== "23505") {
        console.error("[paywise] crypto insert failed", e);
        return NextResponse.json({ ok: false, error: "could not create request" }, { status: 500 });
      }
    }
  }
  if (!requestId) return NextResponse.json({ ok: false, error: "could not allocate a reference" }, { status: 500 });

  // Real site domain (warstudio.site), not the request host — see lib/site-url.ts.
  const origin = await getSiteUrl();
  let created = await createCryptoTransaction({
    merchantReference: trxRef,
    amountCents: Math.round(usdt * 100),
    network: coin.network,
    customerId: String(sess.sub),
    returnUrl: await getReturnUrl({ deposit: "pending", ref: trxRef, amount: usdt, coin: coinKey }),
  });

  if (!created.ok && created.code === "RETURN_URL_NOT_ALLOWED") {
    created = await createCryptoTransaction({
      merchantReference: trxRef,
      amountCents: Math.round(usdt * 100),
      network: coin.network,
      customerId: String(sess.sub),
    });
  }

  if (!created.ok || !created.transaction) {
    await query("DELETE FROM cashier_requests WHERE id = $1 AND status = 'PENDING'", [requestId]).catch(() => {});
    console.error("[paywise] crypto create failed", created.code, created.httpStatus, created.message);
    return NextResponse.json({
      ok: false,
      error: (created.code || "PAYWISE_ERROR").toLowerCase(),
      code: created.code || "PAYWISE_ERROR",
      message: created.message || "PayWise refused the crypto payment",
    }, { status: 502 });
  }

  const t = created.transaction;
  return NextResponse.json({
    ok: true,
    request_id: requestId,
    trx_ref: trxRef,
    coin: coinKey,
    network: t.payment_method?.includes("_") ? t.payment_method.split("_").pop() : (coin.network || ""),
    amount: t.amount,
    pay_amount: t.pay_amount ?? t.amount,
    pay_address: t.pay_address || "",
    checkout_url: t.checkout_url || "",
    qr_string: t.qr_string || "",
    expires_at: t.expires_at || null,
    paywise_reference: t.reference,
  });
}
