/**
 * PayWise — start a deposit (the real thing).
 *
 *   POST /api/payments/paywise/create   { channel: "bKash", amount_cents: 30000 }
 *     → { ok, request_id, trx_ref, checkout_url, method, ... }
 *
 * 1. `trx_ref` (PW-XXXXXX) is our own order reference. It goes to PayWise as
 *    `merchant_reference`, so the signed webhook can find the row without guessing.
 * 2. Read the gateway settings from `deposit_channels` (admin-managed). If the admin
 *    has put a hosted payment page / link template there, we hand the player that
 *    link directly — the method is baked into the URL.
 * 3. Otherwise ask the PayWise API for a transaction. `checkout_url` is the page the
 *    player must pay on; the method is already chosen server-side.
 * 4. If PayWise refuses the method (PAYMENT_METHOD_NOT_APPROVED / anything else) we
 *    delete the pending row and answer with the honest reason — no fake redirect.
 *
 * Nothing is credited here; only the signed webhook (or admin approval) credits.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl, getReturnUrl, getWebhookUrl } from "@/lib/site-url";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { createTransaction, createCheckoutPaymentLink, isConfigured, isCheckoutConfigured, bankCodeFor } from "@/lib/paywise";

export const dynamic = "force-dynamic";

function reference() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `PW-${out}`;
}

function fillTemplate(tpl: string, method: string, amount: string, ref: string) {
  const filled = tpl
    .replace(/\{method\}/gi, method.toLowerCase())
    .replace(/\{amount\}/gi, amount)
    .replace(/\{ref\}/gi, encodeURIComponent(ref));
  if (/\{(method|amount|ref)\}/i.test(filled)) return ""; // unresolved
  return filled;
}

/** The manual wallet row (a real bKash/Nagad/Rocket number) used as the fallback. */
async function manualGuide(method: string) {
  const rows = await query(
    `SELECT channel, account_label, account_number, reference
       FROM deposit_channels
      WHERE is_active = TRUE AND mode <> 'link' AND length(trim(COALESCE(account_number,''))) >= 6
      ORDER BY (channel = $1) DESC, display_order ASC, id ASC
      LIMIT 1`,
    [method]
  ).catch(() => []);
  const r = rows[0] as any;
  if (!r) return null;
  return { account_number: String(r.account_number), account_label: String(r.account_label ?? method), reference: String(r.reference ?? "") };
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "PayWise");
  /** Which wallet the player picked inside the gateway (defaults to the channel name). */
  const method = String(body.method ?? channel);
  const amountCents = Math.trunc(Number(body.amount_cents));

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "amount_cents must be a positive integer" }, { status: 400 });
  }

  // The player picks the wallet (bKash/Nagad/Upay) inside the gateway, so the limits that
  // matter are the gateway row's. Fall back to that row when the wallet name is not a
  // deposit_channels row of its own — it should not depend on an admin row per wallet.
  const ch = (await query(
    `SELECT channel, min_amount_cents, max_amount_cents, is_active,
            COALESCE(api_config,'{}'::jsonb) AS api_config
       FROM deposit_channels WHERE channel = $1
      UNION ALL
     SELECT channel, min_amount_cents, max_amount_cents, is_active,
            COALESCE(api_config,'{}'::jsonb) AS api_config
       FROM deposit_channels WHERE channel = 'PayWise' AND NOT EXISTS (
            SELECT 1 FROM deposit_channels WHERE channel = $1)
      LIMIT 1`,
    [channel]
  ))[0] as any;
  if (!ch || !ch.is_active) return NextResponse.json({ ok: false, error: "channel unavailable" }, { status: 400 });
  const min = Number(ch.min_amount_cents);
  const max = Number(ch.max_amount_cents);
  if (amountCents < min || amountCents > max) {
    return NextResponse.json({ ok: false, error: `amount must be between ৳${min / 100} and ৳${max / 100}` }, { status: 400 });
  }

  const cfg = (ch.api_config ?? {}) as Record<string, string>;
  const payerPhone = await (async () => {
    const rows = await query("SELECT phone FROM users WHERE id = $1", [sess.sub]).catch(() => []);
    return String((rows[0] as any)?.phone ?? "").trim();
  })();
  const amount = (amountCents / 100).toFixed(2);
  // Public origin for return URLs + the webhook we register with PayWise.
  // Never a *.vercel.app preview host: lib/site-url.ts decides (warstudio.site now).
  const origin = await getSiteUrl();

  /* ── 0. a PayWise checkout link is single-use: re-opening it answers
     "Reference exist with existing Merchant." So when the player asks for the pay page
     again (or switches wallet after already getting one), the previous attempt's link is
     dead and can never be paid — drop that still-pending row so it cannot linger as a
     phantom deposit in the player's history. Only ever our own current attempt. ── */
  const previousRef = String(body.previous_ref ?? "").trim();
  if (previousRef) {
    await query(
      "DELETE FROM cashier_requests WHERE trx_ref = $1 AND user_id = $2 AND status = 'PENDING' AND request_type = 'DEPOSIT'",
      [previousRef, sess.sub]
    ).catch(() => {});
  }

  /* ── 1. create the pending row so the webhook always has something to find ── */
  let requestId = 0;
  let trxRef = "";
  for (let attempt = 0; attempt < 5 && !requestId; attempt++) {
    const candidate = reference();
    try {
      const rows = await query(
        `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
         VALUES ($1,'DEPOSIT',$2,'PAYWISE REF',$3,$4,'PENDING') RETURNING id`,
        [sess.sub, channel, candidate, amountCents]
      );
      requestId = Number(rows[0].id);
      trxRef = candidate;
    } catch (e: any) {
      if (String(e?.code) !== "23505") {
        console.error("[paywise] could not create request", e);
        return NextResponse.json({ ok: false, error: "could not create request" }, { status: 500 });
      }
    }
  }
  if (!requestId) return NextResponse.json({ ok: false, error: "could not allocate a reference" }, { status: 500 });

  const rollback = async () => {
    await query("DELETE FROM cashier_requests WHERE id = $1 AND status = 'PENDING'", [requestId]).catch(() => {});
  };

  /* ── 2. an admin-configured payment page wins (it needs no API call) ─────── */
  const perMethod: Record<string, string> = {
    bKash: cfg.bkash_url || "", Nagad: cfg.nagad_url || "", Rocket: cfg.rocket_url || "", Upay: cfg.upay_url || "",
  };
  const tpl = cfg.gateway_url || cfg.checkout_url || "";
  const templated = tpl ? fillTemplate(tpl, method, amount, trxRef) : "";
  const chosen = perMethod[method] || templated;

  if (chosen) {
    return NextResponse.json({
      ok: true,
      request_id: requestId,
      trx_ref: trxRef,
      checkout_url: chosen,
      method,
      source: perMethod[method] ? "method_url" : "template",
      amount_cents: amountCents,
    });
  }

  /* ── 3. otherwise ask PayWise for a real transaction ─────────────────────── */
  if (!isConfigured()) {
    await rollback();
    return NextResponse.json(
      { ok: false, error: "paywise_not_configured", message: "PAYWISE_API_KEY is missing in Vercel" },
      { status: 503 }
    );
  }
  if (!bankCodeFor(method)) {
    await rollback();
    return NextResponse.json(
      { ok: false, error: "method_not_supported", message: `PayWise cannot take ${method}` },
      { status: 400 }
    );
  }

  const returnUrl = await getReturnUrl({
    deposit: "pending", ref: trxRef, amount, channel: method,
  });

  let checkoutError: { code: string; message: string } | null = null;

  /* ── 3a. PayWise Checkout: a hosted page where the player finishes the payment ──
   * This is the only PayWise product that returns a real link for a BDT wallet
   * payment, so it is tried first. Both keys are server-side only. */
  const payeeMobile = String(cfg.payee_mobile || "").trim();
  if (isCheckoutConfigured() && payeeMobile) {
    const link = await createCheckoutPaymentLink({
      transactionId: trxRef,
      amountCents,
      payerMobile: payerPhone || "0000000000",
      payeeMobile,
      urls: {
        success: returnUrl,
        error: await getReturnUrl({ deposit: "failed", ref: trxRef }),
        callback: await getWebhookUrl(),
        notify: await getWebhookUrl(),
      },
    });
    if (link.ok && link.url) {
      console.log("[paywise] checkout link created", trxRef, link.paymentDetailsId);
      return NextResponse.json({
        ok: true,
        request_id: requestId,
        trx_ref: trxRef,
        checkout_url: link.url,
        payment_details_id: link.paymentDetailsId || null,
        method,
        source: "checkout",
        amount_cents: amountCents,
      });
    }
    // Not approved for Checkout yet → remember the reason, then try the API below.
    console.error("[paywise] checkout refused", link.code, link.httpStatus, link.message);
    checkoutError = { code: link.code || "CHECKOUT_ERROR", message: link.message || "" };
  } else if (isCheckoutConfigured() && !payeeMobile) {
    console.warn("[paywise] checkout skipped — payee_mobile not set on the channel");
  }
  let created = await createTransaction({
    merchantReference: trxRef,
    amountCents,
    channel: method,
    customerId: String(sess.sub),
    returnUrl,
  });
  // RETURN_URL_NOT_ALLOWED means the domain is not registered in the PayWise dashboard;
  // the payment can still be created, PayWise just uses the website's own return URL.
  if (!created.ok && created.code === "RETURN_URL_NOT_ALLOWED") {
    created = await createTransaction({
      merchantReference: trxRef,
      amountCents,
      channel: method,
      customerId: String(sess.sub),
    });
  }

  if (!created.ok || !created.transaction) {
    await rollback();
    const code = created.code || "PAYWISE_ERROR";
    // If Checkout is the real blocker (merchant not approved for it), say that instead of
    // the transactions-API reason: it is the one the merchant can act on.
    const checkoutBlocks =
      checkoutError?.code === "PW_MERCHANT_ACCESS_REQUIRED" || checkoutError?.code === "MERCHANT_ACCESS_REQUIRED";
    // Give the player a real place to send the money when the gateway refuses: the
    // admin can paste the bKash/Nagad/Rocket number on the same channel row.
    const guide = await manualGuide(method);
    const friendly = checkoutBlocks
      ? "PayWise has not switched on Checkout (hosted payment page) for this merchant account yet — ask PayWise support to approve Checkout, or pay by " + method + " directly."
      : code === "PAYMENT_METHOD_NOT_APPROVED"
        ? `PayWise has not approved ${method} for this account yet — ask PayWise support to enable it, or pay by ${method} directly.`
        : code === "WEBSITE_REQUIRED"
        ? "No website is registered in the PayWise dashboard yet (Dashboard → Websites & webhook)."
        : created.message || "PayWise refused the transaction";
    console.error("[paywise] create failed", code, created.httpStatus, created.message);
    return NextResponse.json({ ok: false, error: code.toLowerCase(), code, message: friendly, guide }, { status: 502 });
  }

  const t = created.transaction;
  if (!t.checkout_url) {
    // Transaction exists but the hosted page is off for this website: without it
    // there is nothing to redirect to, so do not strand the player on a dead button.
    await rollback();
    return NextResponse.json({
      ok: false,
      error: "checkout_url_missing",
      code: "CHECKOUT_URL_MISSING",
      message: "PayWise created the payment but the hosted payment page is switched off. Ask PayWise support to enable the hosted page for your website.",
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    request_id: requestId,
    trx_ref: trxRef,
    paywise_reference: t.reference,
    checkout_url: t.checkout_url,
    method,
    source: "api",
    amount_cents: amountCents,
  });
}
