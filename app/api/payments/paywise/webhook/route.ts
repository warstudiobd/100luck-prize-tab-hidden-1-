/**
 * PayWise Asia — payment webhook (X-PAYWISE-Signature / X-PAYWISE-Signature-V2)
 *
 *   POST /api/payments/paywise/webhook
 *
 * PayWise signs every delivery with HMAC-SHA256 using one shared signing secret
 * (env PAYWISE_WEBHOOK_SECRET). V2 — `X-PAYWISE-Signature-V2` over
 * `${X-PAYWISE-Timestamp}.${raw_body}` — binds the send time, so a captured delivery
 * cannot be replayed; V1 (`X-PAYWISE-Signature`, body only) still verifies. The RAW
 * body is used before any JSON parsing, and nothing moves money until it passes.
 *
 * Real payload shape (their docs, payment.paid):
 *   { "event": "payment.paid",
 *     "data": { "reference": "PW2026…", "merchant_reference": "PW-AB12CD",
 *               "status": "paid", "amount": 300, "currency": "BDT",
 *               "payment_method": "LOCAL_BDT", "environment": "live", … } }
 * The join key is `merchant_reference`, which is *our* `trx_ref`. `data.reference`
 * is only PayWise's own id, so it is never used to look a request up — matching on
 * it would be a fast door to "not found, ignored" on every real payment.
 *
 * Money path: on paid we lock the `cashier_requests` row, require PENDING, then credit
 * through `applyApprovedDepositTx` — the same idempotent path as admin approval. A
 * retry can never double-credit. Nothing here may answer 5xx: the provider retries
 * forever and the row stays PENDING while the player is out of pocket.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { creditPendingDeposit, rejectPendingDeposit, settleWithdrawal } from "@/lib/credit-pending";
import { clientIp } from "@/lib/ip";

export const dynamic = "force-dynamic";

const PROVIDER = "paywise";

function safeEqualHex(a: string, b: string) {
  try {
    const ba = Buffer.from(String(a).trim().toLowerCase(), "hex");
    const bb = Buffer.from(String(b).trim().toLowerCase(), "hex");
    return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const hmac = (secret: string, payload: string) =>
  crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");

/** How far a V2 timestamp may drift before we treat the delivery as replayed. */
const V2_TOLERANCE_SECONDS = 300;

/**
 * Pull the digest out of a header that may be plain ("<hex>"), prefixed
 * ("sha256=<hex>") or Stripe-style ("t=1700000000,v1=<hex>").
 */
function digestsFrom(header: string): string[] {
  return header
    .split(",")
    .map(part => {
      const eq = part.indexOf("=");
      if (eq > 0 && /^(sha256|v1|v2|sig|signature|s)$/i.test(part.slice(0, eq).trim())) {
        return part.slice(eq + 1).trim();
      }
      return part.trim();
    })
    .filter(Boolean);
}

/** Split "t=<ts>,v1=<sig>" into its parts (empty when the header is a bare digest). */
function headerParts(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return out;
}

function verifySignature(
  secret: string,
  raw: string,
  headers: { v1: string; v2: string; timestamp: string },
): { ok: boolean; scheme: string | null } {
  if (!secret) return { ok: false, scheme: null };

  const matches = (given: string, expectedHex: string) => {
    const b64 = Buffer.from(expectedHex, "hex").toString("base64");
    return digestsFrom(given).some(c => safeEqualHex(c, expectedHex) || c === b64);
  };

  /* ── V2: timestamp is part of the signed string ───────────────────────── */
  if (headers.v2) {
    const headerTs = headers.timestamp.trim() || headerParts(headers.v2).t || "";
    const ts = Number(headerTs);
    if (!headerTs || !Number.isFinite(ts)) return { ok: false, scheme: null };
    const drift = Math.abs(Math.floor(Date.now() / 1000) - Math.floor(ts));
    if (drift > V2_TOLERANCE_SECONDS) return { ok: false, scheme: null }; // replayed
    const tsForms = [headerTs, String(Math.floor(ts > 1e11 ? ts / 1000 : ts))];
    const bodies = [raw, raw.trim()];
    for (const t of tsForms) {
      for (const body of bodies) {
        if (matches(headers.v2, hmac(secret, `${t}.${body}`))) return { ok: true, scheme: "v2:ts.body" };
        if (matches(headers.v2, hmac(secret, `${t}${body}`))) return { ok: true, scheme: "v2:ts+body" };
        if (matches(headers.v2, hmac(secret, `${t}.${crypto.createHash("sha256").update(body, "utf8").digest("hex")}`))) {
          return { ok: true, scheme: "v2:ts.bodyhash" };
        }
      }
    }
    return { ok: false, scheme: null };
  }

  /* ── V1: body-only digest (no replay protection) ──────────────────────── */
  if (headers.v1) {
    for (const body of [raw, raw.trim()]) {
      if (matches(headers.v1, hmac(secret, body))) return { ok: true, scheme: "v1:raw-body" };
    }
    return { ok: false, scheme: null };
  }

  return { ok: false, scheme: null };
}

/** Pull a value out of a nested payload without caring about depth. */
function pick(obj: any, paths: string[]): string {
  for (const path of paths) {
    let cur = obj;
    for (const key of path.split(".")) {
      if (cur === null || cur === undefined) { cur = undefined; break; }
      cur = cur[key];
    }
    if (cur !== undefined && cur !== null && String(cur).trim() !== "") return String(cur).trim();
  }
  return "";
}

// PayWise status vocabulary → our buckets. Anything unrecognised is ignored.
const PAID = ["PAID", "COMPLETED", "SUCCESS", "SUCCESSFUL", "SETTLED", "APPROVED", "CAPTURED"];
const DEAD = ["FAILED", "CANCELLED", "CANCELED", "DECLINED", "EXPIRED", "ERROR", "REVERSED", "REFUNDED", "VOID"];

/** Where our own order reference lives in a delivery. `merchant_reference` first. */
const REF_PATHS = [
  // Withdrawal callbacks carry our payout reference as withdrawal_id, not a merchant
  // reference. Without these the delivery is dropped as "no reference".
  "withdrawal_id", "data.withdrawal_id", "data.withdrawal.id",
  "merchant_reference", "data.merchant_reference",
  "transaction_request.merchant_order_id", "merchant_order_id",
  "trx_ref", "data.trx_ref", "order_id", "data.order_id",
  // PayWise withdrawal callbacks identify the payout with data.reference (PWD…).
  "data.reference", "reference",
];

/** Status, from either the event name or the status field. */
const STATUS_PATHS = [
  "status", "data.status", "payment_details.status", "payment_status", "data.payment_status", "state", "data.state",
];

/** The event name ("payment.paid") when there is one. */
const EVENT_PATHS = ["event", "event_type", "type", "data.event"];

export async function POST(req: NextRequest) {
  const secret = process.env.PAYWISE_WEBHOOK_SECRET || "";
  const raw = await req.text();
  const headers = {
    v1: (req.headers.get("x-paywise-signature") || "").trim(),
    v2: (req.headers.get("x-paywise-signature-v2") || "").trim(),
    timestamp: (req.headers.get("x-paywise-timestamp") || "").trim(),
  };
  const ip = clientIp(req) || null;

  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { payload = null; }

  const { ok: sigOk, scheme } = verifySignature(secret, raw, headers);

  const trxRef = pick(payload ?? {}, REF_PATHS);
  const eventName = pick(payload ?? {}, EVENT_PATHS).toLowerCase();
  const statusField = pick(payload ?? {}, STATUS_PATHS).toUpperCase();
  const status = statusField || eventName.split(".").pop()?.toUpperCase() || "";

  const eventId =
    pick(payload ?? {}, ["id", "event_id", "data.id", "data.event_id", "data.reference", "reference"]) || null;

  const amountRaw = pick(payload ?? {}, ["amount", "data.amount", "payment_details.amount", "transaction_request.amount"]);
  // PayWise sends major units (300 = ৳300); our ledger is poisha.
  const amountCents = amountRaw && Number.isFinite(Number(amountRaw)) ? Math.round(Number(amountRaw) * 100) : null;
  const environment = pick(payload ?? {}, ["data.environment", "environment"]);

  const record = async (outcome: string, httpStatus: number) => {
    await query(
      `INSERT INTO webhook_events
        (provider, event_id, signature_ok, sig_scheme, trx_ref, outcome, http_status, amount_cents, payload, raw_body, remote_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (provider, event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [PROVIDER, eventId, sigOk, scheme, trxRef || null, outcome, httpStatus,
       amountCents, payload, raw.slice(0, 20000), ip]
    ).catch(e => console.error("[paywise] could not store webhook event", e));
  };

  if (!sigOk) {
    await record("bad_signature", 401);
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  // Sandbox payments must never move real money.
  if (environment && environment !== "live" && environment !== "production") {
    await record("ignored", 200);
    return NextResponse.json({ ok: true, ignored: `environment ${environment}` });
  }

  /* ── Withdrawals ───────────────────────────────────────────────────────
   *
   * withdrawal.completed / .failed / .rejected report on a PAYOUT, not a deposit.
   * They MUST be routed before the deposit branches below: "completed" is in the
   * PAID vocabulary, so an unrouted withdrawal callback would be credited as if
   * the player had deposited that amount again. That is free money for anyone who
   * can trigger a payout.
   */
  const isWithdrawalEvent = eventName.startsWith("withdrawal.");
  if (isWithdrawalEvent) {
    const failed = eventName.endsWith(".failed") || eventName.endsWith(".rejected")
      || DEAD.includes(status);
    const outcome = await settleWithdrawal(trxRef, failed);
    await record(outcome, 200);
    return NextResponse.json({ ok: true, outcome });
  }

  if (!trxRef) {
    await record("unknown_ref", 200);
    return NextResponse.json({ ok: true, ignored: "no merchant reference in payload" });
  }

  if (PAID.includes(status)) {
    const outcome = await creditPendingDeposit(trxRef);
    await record(outcome, 200);
    return NextResponse.json({ ok: true, outcome });
  }

  if (DEAD.includes(status)) {
    await rejectPendingDeposit(trxRef);
    await record("ignored", 200);
    return NextResponse.json({ ok: true, outcome: "rejected" });
  }

  await record("ignored", 200);
  return NextResponse.json({ ok: true, ignored: `status ${status || "(none)"}` });
}

/**
 * GET on this path is not used by PayWise for webhooks — but a human pasting the
 * URL into a browser should see a clear answer instead of a 405.
 */
export async function GET() {
  const configured = Boolean(process.env.PAYWISE_WEBHOOK_SECRET);
  return NextResponse.json({
    ok: true,
    endpoint: "PayWise Asia webhook",
    method: "POST",
    signature_headers: ["X-PAYWISE-Signature-V2", "X-PAYWISE-Timestamp", "X-PAYWISE-Signature"],
    preferred: "V2 (timestamp-bound)",
    join_key: "merchant_reference = cashier_requests.trx_ref",
    secret_configured: configured,
  });
}
