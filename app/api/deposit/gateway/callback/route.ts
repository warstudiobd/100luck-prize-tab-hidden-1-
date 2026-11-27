/**
 * API-gateway deposit — step 2 (IPN / return URL).
 * Verifies an HMAC-SHA256 signature (hex) of the RAW POST body — or of the
 * sorted query string for GET returns — using env DEPOSIT_API_SECRET.
 * On "paid": marks the PENDING request APPROVED and credits the wallet through
 * the same idempotent path as manual admin approval (ledger call_id
 * csh_dep_appr_<id>, referral qualification check included).
 * POST → JSON ack · GET → 303 redirect to /deposit?deposit=success|failed.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withTransaction, query } from "@/lib/db";
import { applyApprovedDepositTx } from "@/lib/deposits";

export const dynamic = "force-dynamic";

function safeEqualHex(a: string, b: string) {
  try {
    const ba = Buffer.from(String(a).toLowerCase(), "hex");
    const bb = Buffer.from(String(b).toLowerCase(), "hex");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
const hmacSha256 = (secret: string, payload: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

async function parseFields(req: NextRequest, raw: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const type = req.headers.get("content-type") || "";
  if (req.method === "POST") {
    if (type.includes("application/json")) {
      try { const j = JSON.parse(raw); for (const [k, v] of Object.entries(j || {})) out[k] = String(v ?? ""); return out; } catch { return out; }
    }
    new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
    return out;
  }
  new URL(req.url).searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

function signedPayloadString(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([k]) => !/^(signature|sign|x-signature|x_sign|hmac)$/i.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

/**
 * Relay a PayWise delivery to the real PayWise receiver, keeping the raw body and
 * every signature header byte-for-byte so its verification still passes.
 */
async function forwardToPayWise(req: NextRequest, raw: string) {
  const target = new URL("/api/payments/paywise/webhook", new URL(req.url).origin);
  const headers: Record<string, string> = { "content-type": req.headers.get("content-type") || "application/json" };
  for (const h of ["x-paywise-signature", "x-paywise-signature-v2", "x-paywise-timestamp", "x-paywise-event", "x-paywise-event-id"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  try {
    const r = await fetch(target, {
      method: "POST",
      headers,
      body: req.method === "POST" ? raw : undefined,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") || "application/json", "x-forwarded-to": "paywise" },
    });
  } catch {
    // Never 5xx here: a retry would just replay the same failing hop.
    return NextResponse.json({ ok: true, forwarded: false, note: "paywise receiver unreachable" }, { status: 200 });
  }
}

async function handle(req: NextRequest) {
  const raw = req.method === "POST" ? await req.text() : "";

  /**
   * PayWise deliveries that land on this legacy URL used to fall through to
   * `503 gateway_not_configured`, which burned all three retries and told the
   * provider nothing. Hand anything carrying a PayWise signature to the PayWise
   * receiver instead of failing here.
   */
  if (
    req.headers.get("x-paywise-signature") ||
    req.headers.get("x-paywise-signature-v2")
  ) {
    return forwardToPayWise(req, raw);
  }

  const secret = process.env.DEPOSIT_API_SECRET || "";
  if (!secret) {
    /**
     * An unsigned *test* delivery ("webhook.test" / reference "Test") is a dashboard
     * "send test" button, not money. Ack it so the retry counter stops climbing and
     * the merchant can see the hop works; nothing is credited.
     */
    if (/webhook\.test|"reference"\s*:\s*"test"/i.test(raw)) {
      return NextResponse.json({ ok: true, received: "test event", credited: false }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "gateway_not_configured" }, { status: 503 });
  }
  const fields = await parseFields(req, raw);

  const given = String(
    req.headers.get("x-signature") || fields.signature || fields.sign || fields.x_sign || fields.hmac || ""
  ).trim().toLowerCase();
  const expected = hmacSha256(secret, req.method === "POST" ? raw : signedPayloadString(fields));
  const expectedFields = hmacSha256(secret, signedPayloadString(fields));
  if (!given || !(safeEqualHex(given, expected) || safeEqualHex(given, expectedFields))) {
    console.warn("[gateway] callback rejected: bad signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const trxRef = String(fields.order_id ?? fields.merchant_order_id ?? fields.trx_ref ?? fields.transaction_id ?? "").trim();
  const status = String(fields.status ?? fields.payment_status ?? fields.state ?? fields.result ?? "").toUpperCase().trim();
  if (!trxRef) return NextResponse.json({ ok: false, error: "missing order reference" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const isPaid = ["SUCCESS", "PAID", "COMPLETED", "APPROVED", "SETTLED"].includes(status);

  if (isPaid) {
    try {
      await withTransaction(async (client: any) => {
        const r = await client.query("SELECT * FROM cashier_requests WHERE trx_ref = $1 FOR UPDATE", [trxRef]);
        const cr = r.rows[0];
        if (!cr || cr.status !== "PENDING") return; // already processed — idempotent
        const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [cr.user_id]);
        if (!locked.rows[0]) return;
        await applyApprovedDepositTx(client, {
          requestId: Number(cr.id),
          userId: Number(cr.user_id),
          amountCents: Number(cr.amount_cents),
          balanceBefore: Number(locked.rows[0].balance_cents),
        });
      });
    } catch (e) {
      console.error("[gateway] callback approval failed", e);
      if (req.method === "POST") return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
      return NextResponse.redirect(`${origin}/deposit?deposit=failed`, 303);
    }
    if (req.method === "POST") return NextResponse.json({ ok: true });
    return NextResponse.redirect(`${origin}/deposit?deposit=success`, 303);
  }

  // Explicit failure / cancellation → close out the pending request
  if (["FAILED", "CANCELLED", "CANCELED", "DECLINED", "EXPIRED", "ERROR"].includes(status)) {
    await query("UPDATE cashier_requests SET status='REJECTED' WHERE trx_ref = $1 AND status = 'PENDING'", [trxRef]).catch(() => {});
  }
  if (req.method === "POST") return NextResponse.json({ ok: true });
  return NextResponse.redirect(`${origin}/deposit?deposit=failed`, 303);
}
