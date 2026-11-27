/**
 * PayWise Asia — start a deposit (step 1).
 *
 *   POST /api/payments/paywise/initiate   { channel: "bKash", amount_cents: 50000 }
 *
 * Flow, and why it is in this order:
 *   1. Create the PENDING `cashier_requests` row first, so the order id we hand PayWise
 *      already exists when the callback arrives (their delivery can beat our redirect).
 *   2. Ask PayWise for a hosted payment link. `transaction_request.id` = our `trx_ref`,
 *      which is the join key the webhook matches on.
 *   3. Return the link; the client redirects the player to PayWise.
 *
 * Credentials — all env, never in the DB:
 *   PAYWISE_API_KEY          merchant key            (pw_live_… / pw_test_…)
 *   PAYWISE_SUBSCRIPTION_KEY developer key for the `PW-subscription-key` header
 *   PAYWISE_BASE_URL         default https://api.paywise.co
 *   PAYWISE_ORIGIN_COUNTRY   default BD
 *
 * If the subscription key or merchant key is missing we answer 503
 * `paywise_not_configured` and NOTHING is charged; the PENDING row is rolled back so
 * the player's history does not fill with phantom orders.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const CHANNELS = ["bKash", "Nagad", "Rocket", "Card"];

/** `YYYY-MM-DD HH:mm:ss` in UTC — PayWise rejects any other shape. */
const requestDate = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function orderRef() {
  return `PW${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

type PayWiseBody = {
  api_key: string;
  fraud_check: number;
  transaction_request: {
    id: string;
    amount: string;
    currency: string;
    description?: string;
    fees: { pays_fees: number; payer_covers: number };
    payees: Array<{ mobile_number: string; amount: string; delay_days: number }>;
    payers: Array<Record<string, unknown>>;
    urls: { success: string; notify: string; error: string; callback: string };
  };
};

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "bKash");
  const amountCents = Math.trunc(Number(body.amount_cents));
  if (!CHANNELS.includes(channel)) {
    return NextResponse.json({ ok: false, error: "unknown channel" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "amount_cents must be a positive integer" }, { status: 400 });
  }

  const ch = (await query(
    "SELECT channel, min_amount_cents, max_amount_cents, is_active, mode FROM deposit_channels WHERE channel = $1",
    [channel]
  ))[0] as any;
  if (!ch || !ch.is_active) return NextResponse.json({ ok: false, error: "channel unavailable" }, { status: 400 });
  if (amountCents < Number(ch.min_amount_cents) || amountCents > Number(ch.max_amount_cents)) {
    return NextResponse.json({
      ok: false,
      error: `amount must be between ৳${Number(ch.min_amount_cents) / 100} and ৳${Number(ch.max_amount_cents) / 100}`,
    }, { status: 400 });
  }

  const apiKey = process.env.PAYWISE_API_KEY || "";
  const subKey = process.env.PAYWISE_SUBSCRIPTION_KEY || "";
  if (!apiKey || !subKey) {
    // Say exactly which one is missing — "gateway_not_configured" hid this for days.
    return NextResponse.json({
      ok: false,
      error: "paywise_not_configured",
      missing: [!apiKey && "PAYWISE_API_KEY", !subKey && "PAYWISE_SUBSCRIPTION_KEY"].filter(Boolean),
      message: "Payment gateway is not connected yet — please use the manual TrxID deposit method.",
    }, { status: 503 });
  }

  const baseUrl = (process.env.PAYWISE_BASE_URL || "https://api.paywise.co").replace(/\/+$/, "");
  const originCountry = (process.env.PAYWISE_ORIGIN_COUNTRY || "BD").toUpperCase();

  const trxRef = orderRef();
  const amount = (amountCents / 100).toFixed(2);
  const origin = await getSiteUrl();
  const webhook = `${origin}/api/payments/paywise/webhook`;

  const inserted = await query(
    `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
     VALUES ($1,'DEPOSIT',$2,'PAYWISE',$3,$4,'PENDING') RETURNING id`,
    [sess.sub, channel, trxRef, amountCents]
  );
  const requestId = Number(inserted[0].id);

  const rollback = async () => {
    await query("DELETE FROM cashier_requests WHERE id = $1 AND status = 'PENDING'", [requestId]).catch(() => {});
  };

  const payload: PayWiseBody = {
    api_key: apiKey,
    fraud_check: 0,
    transaction_request: {
      id: trxRef,
      amount,
      currency: "BDT",
      description: `Deposit ${channel}`,
      fees: { pays_fees: 1, payer_covers: 0 },
      payees: [{ mobile_number: "+8801700000000", amount, delay_days: 0 }],
      payers: [{
        mobile_number: "+8801700000000",
        first_name: "Player",
        last_name: String(requestId),
        email: `player${sess.sub}@sonali7.example`,
        payment_channel: "payment_link",
        payment_method: channel === "Card" ? "card" : "wallet",
        amount,
      }],
      urls: { success: `${origin}/deposit?deposit=success`, notify: webhook, error: `${origin}/deposit?deposit=failed`, callback: webhook },
    },
  };

  try {
    const r = await fetch(`${baseUrl}/payments/request?version=2024-10-01`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PW-subscription-key": subKey,
        "PW-origin-country": originCountry,
        "PW-request-date": requestDate(),
        "PW-ip-address": process.env.PAYWISE_IP_ADDRESS || "0.0.0.0",
        "User-Agent": "sonali7-casino/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data || data.status === "error") {
      await rollback();
      const code = String(data?.errorCode || data?.code || r.status);
      console.error("[paywise] create payment failed", code, data?.message);
      return NextResponse.json({
        ok: false,
        error: "paywise_error",
        code,
        message: data?.message || "PayWise rejected the payment request",
      }, { status: 502 });
    }

    const redirectUrl =
      data?.payment_details?.payers?.[0]?.url ||
      data?.payment_details?.url ||
      data?.payment_details?.checkout_url ||
      "";
    if (!redirectUrl) {
      await rollback();
      return NextResponse.json({ ok: false, error: "paywise_error", message: "no payment link in response" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      request_id: requestId,
      trx_ref: trxRef,
      amount_cents: amountCents,
      payment_id: data?.payment_details?.id ?? null,
      redirect_url: redirectUrl,
    });
  } catch (e) {
    await rollback();
    console.error("[paywise] initiate threw", e);
    return NextResponse.json({ ok: false, error: "paywise_unreachable" }, { status: 502 });
  }
}

/** Diagnostic — tells you which piece of the integration is missing, without secrets. */
export async function GET() {
  const configured = Boolean(process.env.PAYWISE_API_KEY && process.env.PAYWISE_SUBSCRIPTION_KEY);
  return NextResponse.json({
    ok: true,
    endpoint: "PayWise Asia — create payment",
    method: "POST",
    body: { channel: "bKash | Nagad | Rocket | Card", amount_cents: 50000 },
    configured,
    missing: [
      !process.env.PAYWISE_API_KEY && "PAYWISE_API_KEY",
      !process.env.PAYWISE_SUBSCRIPTION_KEY && "PAYWISE_SUBSCRIPTION_KEY",
    ].filter(Boolean),
    base_url: process.env.PAYWISE_BASE_URL || "https://api.paywise.co",
    origin_country: process.env.PAYWISE_ORIGIN_COUNTRY || "BD",
  });
}
