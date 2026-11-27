/**
 * API-gateway deposit — step 1. Player picks a channel switched to "API" mode in
 * the admin panel; we create a PENDING cashier_request (trx_ref = gateway order id)
 * and ask the configured gateway to initiate a payment.
 * The gateway holds NO secrets in the DB — env DEPOSIT_API_KEY signs outgoing calls,
 * DEPOSIT_API_SECRET verifies the callback. Without them this returns 503
 * gateway_not_configured and NOTHING is charged.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "");
  const amountCents = Math.trunc(Number(body.amount_cents));
  if (!["bKash", "Nagad", "Rocket"].includes(channel)) {
    return NextResponse.json({ ok: false, error: "unknown channel" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "amount_cents must be a positive integer" }, { status: 400 });
  }

  const ch = (await query(
    "SELECT channel, account_label, min_amount_cents, max_amount_cents, is_active, mode, api_provider, api_base_url, api_config FROM deposit_channels WHERE channel = $1",
    [channel]
  ))[0] as any;
  if (!ch || !ch.is_active) return NextResponse.json({ ok: false, error: "channel unavailable" }, { status: 400 });
  if (ch.mode !== "api") return NextResponse.json({ ok: false, error: "channel is not API-enabled" }, { status: 400 });
  if (amountCents < Number(ch.min_amount_cents) || amountCents > Number(ch.max_amount_cents)) {
    return NextResponse.json({ ok: false, error: `amount must be between ৳${Number(ch.min_amount_cents) / 100} and ৳${Number(ch.max_amount_cents) / 100}` }, { status: 400 });
  }

  const baseUrl = String(ch.api_base_url ?? "").trim().replace(/\/+$/, "");
  const apiKey = process.env.DEPOSIT_API_KEY || "";
  if (!baseUrl || !/^https:\/\//i.test(baseUrl) || !apiKey) {
    return NextResponse.json({
      ok: false,
      error: "gateway_not_configured",
      message: "Payment gateway is not connected yet — please use the manual TrxID deposit method.",
    }, { status: 503 });
  }

  const cfg = (ch.api_config && typeof ch.api_config === "object") ? ch.api_config : {};
  const trxRef = `API${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const origin = new URL(req.url).origin;

  const rows = await query(
    `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
     VALUES ($1,'DEPOSIT',$2,'API GATEWAY',$3,$4,'PENDING') RETURNING id`,
    [sess.sub, channel, trxRef, amountCents]
  );
  const requestId = Number(rows[0].id);

  try {
    const payload = {
      order_id: trxRef,
      merchant_order_id: trxRef,
      amount_cents: amountCents,
      amount: (amountCents / 100).toFixed(2),
      currency: "BDT",
      channel,
      provider: String(ch.api_provider || "generic"),
      merchant_id: String(cfg.merchant_id ?? ""),
      store_id: String(cfg.store_id ?? ""),
      callback_url: `${origin}/api/deposit/gateway/callback`,
      ipn_url: `${origin}/api/deposit/gateway/callback`,
    };
    const r = await fetch(`${baseUrl}/deposit/initiate`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}`, "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const data: any = await r.json().catch(() => null);
    const redirect =
      data?.redirect_url ?? data?.checkout_url ?? data?.payment_url ?? data?.url ??
      data?.data?.redirect_url ?? data?.data?.checkout_url ?? data?.data?.payment_url ?? data?.data?.url;
    if (!r.ok || !redirect) throw new Error(`gateway responded ${r.status}`);
    return NextResponse.json({ ok: true, redirect_url: String(redirect), request_id: requestId, trx_ref: trxRef });
  } catch (e: any) {
    // Gateway failed — reject the pending request so it cannot dangle
    await query("UPDATE cashier_requests SET status='REJECTED' WHERE id = $1 AND status = 'PENDING'", [requestId]).catch(() => {});
    console.error("[gateway] initiate failed", e);
    return NextResponse.json({ ok: false, error: "gateway_error", message: "Could not start payment with the gateway — please use the manual TrxID method." }, { status: 502 });
  }
}
