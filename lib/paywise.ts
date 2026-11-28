/**
 * PayWise Asia — the two APIs, in one place.
 *
 * PayWise exposes *two* different services, and they need different credentials:
 *
 *   1. Checkout / wrappers  → https://api.paywise.co
 *        POST /payments/request?version=2024-10-01
 *        GET  /payments/status?version=2024-10-01&payment_details_id=…
 *        Headers: PW-subscription-key (pwsk_prod_…), PW-origin-country,
 *                 PW-request-date (UTC "YYYY-MM-DD HH:mm:ss"), PW-ip-address, User-Agent
 *        Body:    { api_key: <merchant pw_live_…>, transaction_request: { … } }
 *      This is the one that actually produces a hosted payment link for a wallet payment
 *      (payment_channel "payment_link"). Requires the merchant to be approved for
 *      Checkout ("PW_MERCHANT_ACCESS_REQUIRED" until it is).
 *
 *   2. Transactions API     → https://paywise.asia/api/v1
 *        POST /transactions   (Bearer pw_live_…, QRIS / USDT / LOCAL rails)
 *      No card link, but it is what most merchants get first, and it is what
 *      /api/payments/paywise/create falls back to.
 *
 * Nothing here is imported by a client component: the keys stay on the server.
 */

const CHECKOUT_BASE = (process.env.PAYWISE_CHECKOUT_BASE_URL || "https://api.paywise.co").replace(/\/+$/, "");

export const PAYWISE_BASE_URL = (() => {
  const raw = (process.env.PAYWISE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "https://paywise.asia/api/v1";
  if (raw.includes("api.paywise.co")) return "https://paywise.asia/api/v1"; // retired host
  return raw;
})();

/** Bangladesh wallets → PayWise LOCAL bank_code (Transactions API). */
export const PAYWISE_BDT_BANK_CODES: Record<string, string> = {
  bKash: "BKASH",
  Nagad: "NAGAD",
  Upay: "UPAY",
};

export function apiKey(): string {
  return (process.env.PAYWISE_API_KEY || "").trim();
}

export function subscriptionKey(): string {
  return (process.env.PAYWISE_SUBSCRIPTION_KEY || "").trim();
}

/** True when the public Transactions API can be called. */
export function isConfigured(): boolean {
  return Boolean(apiKey());
}

/** True when the Checkout wrapper can be called (needs both keys). */
export function isCheckoutConfigured(): boolean {
  return Boolean(apiKey() && subscriptionKey());
}

export function bankCodeFor(channel: string): string {
  return PAYWISE_BDT_BANK_CODES[channel] ?? "";
}

export interface PayWiseTransaction {
  reference: string;
  merchant_reference: string;
  status: "pending" | "paid" | "failed" | "expired" | string;
  amount: number | string;
  currency: string;
  payment_method: string;
  environment?: string;
  checkout_url: string | null;
  qr_string?: string | null;
  pay_address?: string | null;
  pay_amount?: number | string | null;
  expires_at?: string | null;
}

export interface CreateResult {
  ok: boolean;
  httpStatus: number;
  transaction?: PayWiseTransaction;
  /** PayWise error code, e.g. PAYMENT_METHOD_NOT_APPROVED / PW_MERCHANT_ACCESS_REQUIRED. */
  code?: string;
  message?: string;
}

const utcStamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/* ────────────────────────── Checkout (api.paywise.co) ────────────────────── */

export interface CheckoutLink {
  ok: boolean;
  httpStatus: number;
  /** The hosted page the player must open. */
  url?: string;
  /** PayWise's opaque payment id — needed later for /payments/status. */
  paymentDetailsId?: string;
  transactionId?: string;
  code?: string;
  message?: string;
}

/**
 * Create a hosted wallet payment link.
 *
 * `payment_channel: "payment_link"` + `payment_method: "wallet"` = the player gets a
 * page where they finish the payment in their own bKash/Nagad app. That is the flow the
 * deposit screen needs, so nothing is guessed on the browser side.
 */
export async function createCheckoutPaymentLink(opts: {
  transactionId: string;
  amountCents: number;
  payerMobile: string;
  payeeMobile: string;
  currency?: string;
  description?: string;
  urls: { success: string; error: string; callback?: string; notify?: string };
}): Promise<CheckoutLink> {
  if (!isCheckoutConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_checkout_not_configured", message: "PAYWISE_SUBSCRIPTION_KEY or PAYWISE_API_KEY is missing" };
  }
  const amount = (opts.amountCents / 100).toFixed(2);
  const body = {
    api_key: apiKey(),
    fraud_check: 0,
    transaction_request: {
      id: opts.transactionId,
      amount,
      currency: opts.currency || "BDT",
      description: opts.description || "deposit",
      fees: { pays_fees: 1, payer_covers: 0 },
      payees: [{ mobile_number: opts.payeeMobile, amount, delay_days: 0 }],
      payers: [{
        mobile_number: opts.payerMobile,
        first_name: "Player",
        last_name: opts.transactionId,
        email: `player-${String(opts.transactionId).toLowerCase()}@sonali7.example`,
        payment_channel: "payment_link",
        payment_method: "wallet",
        amount,
      }],
      urls: {
        success: opts.urls.success,
        error: opts.urls.error,
        callback: opts.urls.callback || opts.urls.success,
        notify: opts.urls.notify || opts.urls.callback || opts.urls.success,
      },
    },
  };

  let res: Response, text: string;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    res = await fetch(`${CHECKOUT_BASE}/payments/request?version=2024-10-01`, {
      method: "POST",
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "PW-subscription-key": subscriptionKey(),
        "PW-origin-country": (process.env.PAYWISE_ORIGIN_COUNTRY || "BD").toUpperCase(),
        "PW-request-date": utcStamp(),
        "PW-ip-address": process.env.PAYWISE_IP_ADDRESS || "0.0.0.0",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    clearTimeout(timer);
    text = await res.text();
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise Checkout" };
  }

  let json: any = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }

  if (res.ok && (json?.status === "success" || json?.payment_details)) {
    const payer = Array.isArray(json?.payment_details?.payers) ? json.payment_details.payers[0] : null;
    return {
      ok: true,
      httpStatus: res.status,
      url: payer?.url ? String(payer.url) : undefined,
      paymentDetailsId: json?.payment_details?.id ? String(json.payment_details.id) : undefined,
      transactionId: json?.payment_details?.transaction_id ? String(json.payment_details.transaction_id) : opts.transactionId,
    };
  }

  return {
    ok: false,
    httpStatus: res.status,
    code: json?.errorCode || json?.code ? String(json.errorCode || json.code) : "CHECKOUT_ERROR",
    message: json?.message || json?.error?.message || "PayWise refused the payment request",
  };
}

/** Ask Checkout what happened to a payment (`PW-payment_details_id`). */
export async function getCheckoutStatus(paymentDetailsId: string): Promise<CheckoutLink & { status?: string }> {
  if (!isCheckoutConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_checkout_not_configured", message: "keys missing" };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `${CHECKOUT_BASE}/payments/status?version=2024-10-01&payment_details_id=${encodeURIComponent(paymentDetailsId)}`,
      {
        method: "GET", signal: ctrl.signal, cache: "no-store",
        headers: {
          "PW-subscription-key": subscriptionKey(),
          "PW-origin-country": (process.env.PAYWISE_ORIGIN_COUNTRY || "BD").toUpperCase(),
          "PW-request-date": utcStamp(),
          "PW-ip-address": process.env.PAYWISE_IP_ADDRESS || "0.0.0.0",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json",
        },
      }
    );
    clearTimeout(timer);
    const json: any = await res.json().catch(() => null);
    const pd = json?.payment_details ?? json?.data ?? null;
    if (res.ok && pd) {
      return {
        ok: true, httpStatus: res.status,
        status: String(pd.status ?? pd.payers?.[0]?.status ?? ""),
        url: pd.payers?.[0]?.url ? String(pd.payers[0].url) : undefined,
        paymentDetailsId,
      };
    }
    return { ok: false, httpStatus: res.status, code: json?.errorCode || "STATUS_ERROR", message: json?.message || "status unavailable" };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise Checkout" };
  }
}

/* ──────────────────── Transactions API (paywise.asia/api/v1) ─────────────── */

async function call(path: string, init: RequestInit, timeoutMs = 15000): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${PAYWISE_BASE_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    if (res.status === 401) {
      console.error("[paywise] 401 — key prefix:", apiKey().slice(0, 8), "len:", apiKey().length, "body:", text.slice(0, 200));
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function createTransaction(opts: {
  merchantReference: string;
  amountCents: number;
  channel: string;
  customerId: string;
  customerName?: string;
  returnUrl?: string;
}): Promise<CreateResult> {
  const bankCode = bankCodeFor(opts.channel);
  if (!isConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_not_configured", message: "PAYWISE_API_KEY is not set" };
  }
  if (!bankCode) {
    return { ok: false, httpStatus: 0, code: "METHOD_NOT_SUPPORTED", message: `${opts.channel} is not a PayWise payment method` };
  }

  const payload: Record<string, unknown> = {
    merchant_reference: opts.merchantReference,
    amount: Number((opts.amountCents / 100).toFixed(2)),
    payment_method: "LOCAL",
    currency: "BDT",
    bank_code: bankCode,
    customer_id: opts.customerId.slice(0, 100),
  };
  if (opts.customerName) payload.customer_name = opts.customerName.slice(0, 50);
  if (opts.returnUrl) payload.return_url = opts.returnUrl;

  let r: { status: number; json: any };
  try {
    r = await call("/transactions", { method: "POST", body: JSON.stringify(payload) });
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }

  if (r.json?.success && r.json?.data) {
    return { ok: true, httpStatus: r.status, transaction: normalise(r.json.data) };
  }
  return {
    ok: false,
    httpStatus: r.status,
    code: r.json?.error?.code || "UNKNOWN",
    message: r.json?.error?.message || "PayWise refused the transaction",
  };
}

/**
 * Crypto deposit: `payment_method: "USDT"` + `network: "BEP20"`.
 * Separate from `createTransaction` because that one only maps BDT wallet channels and
 * would reject anything that is not bKash/Nagad/Upay.
 */
export async function createCryptoTransaction(opts: {
  merchantReference: string;
  amountCents: number;
  network?: string;
  customerId: string;
  returnUrl?: string;
}): Promise<CreateResult> {
  if (!isConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_not_configured", message: "PAYWISE_API_KEY is not set" };
  }
  const payload: Record<string, unknown> = {
    merchant_reference: opts.merchantReference,
    amount: Number((opts.amountCents / 100).toFixed(2)),
    currency: "USDT",
    payment_method: "USDT",
    network: opts.network || "BEP20",
    customer_id: opts.customerId.slice(0, 100),
  };
  if (opts.returnUrl) payload.return_url = opts.returnUrl;

  let r: { status: number; json: any };
  try {
    r = await call("/transactions", { method: "POST", body: JSON.stringify(payload) });
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }
  if (r.json?.success && r.json?.data) return { ok: true, httpStatus: r.status, transaction: normalise(r.json.data) };
  return {
    ok: false,
    httpStatus: r.status,
    code: r.json?.error?.code || "UNKNOWN",
    message:
      r.json?.error?.message ||
      JSON.stringify(r.json?.error?.fields ?? {}) ||
      "PayWise refused the crypto payment",
  };
}

export async function getTransaction(reference: string): Promise<CreateResult> {
  if (!isConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_not_configured", message: "PAYWISE_API_KEY is not set" };
  }
  try {
    const r = await call(`/transactions/${encodeURIComponent(reference)}`, { method: "GET" });
    if (r.json?.success && r.json?.data) return { ok: true, httpStatus: r.status, transaction: normalise(r.json.data) };
    return {
      ok: false, httpStatus: r.status,
      code: r.json?.error?.code || "UNKNOWN",
      message: r.json?.error?.message || "PayWise could not return the transaction",
    };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }
}

/**
 * Find the PayWise transaction created for one of our references.
 * The API filters by `merchant_reference` (exact match), which is our `trx_ref`.
 */
export async function findTransactionByMerchantReference(
  merchantReference: string
): Promise<CreateResult> {
  if (!isConfigured()) {
    return { ok: false, httpStatus: 0, code: "paywise_not_configured", message: "PAYWISE_API_KEY is not set" };
  }
  try {
    const r = await call(
      `/transactions?merchant_reference=${encodeURIComponent(merchantReference)}&per_page=1`,
      { method: "GET" }
    );
    const row = Array.isArray(r.json?.data) ? r.json.data[0] : null;
    if (r.json?.success && row) return { ok: true, httpStatus: r.status, transaction: normalise(row) };
    return {
      ok: false, httpStatus: r.status,
      code: r.json?.error?.code || "NOT_FOUND",
      message: r.json?.error?.message || "no PayWise transaction for that reference yet",
    };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }
}

function normalise(d: any): PayWiseTransaction {
  return {
    reference: String(d?.reference ?? ""),
    merchant_reference: String(d?.merchant_reference ?? ""),
    status: String(d?.status ?? ""),
    amount: d?.amount ?? 0,
    currency: String(d?.currency ?? ""),
    payment_method: String(d?.payment_method ?? ""),
    environment: d?.environment ? String(d.environment) : undefined,
    checkout_url: d?.checkout_url ? String(d.checkout_url) : null,
    qr_string: d?.qr_string ? String(d.qr_string) : null,
    pay_address: d?.pay_address ? String(d.pay_address) : null,
    pay_amount: d?.pay_amount ?? null,
    expires_at: d?.expires_at ? String(d.expires_at) : null,
  };
}

/** What this merchant account can actually collect + pay out (live, from PayWise).
 *  Used to tell the operator the truth on the deposit screen instead of a dead button:
 *  an account holding only USDT + LOCAL_BDT payouts cannot take a bKash deposit. */
export async function getBalance(): Promise<
  { ok: true; methods: Record<string, { currency: string; available?: number }> } | { ok: false }
> {
  if (!isConfigured()) return { ok: false };
  try {
    const r = await call("/balance", { method: "GET" });
    if (r.json?.success && r.json?.data?.methods) return { ok: true, methods: r.json.data.methods };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/* ────────────────────────── Withdrawals (payouts) ─────────────────────────
 *
 * POST /withdrawals moves money OUT of the merchant balance to a player's wallet.
 * It is a separate permission on the API key: an account can take deposits while
 * still being refused payouts, which answers
 *
 *   403 { code: "WITHDRAW_NOT_ENABLED" }
 *   "This API key may not request withdrawals: the account owner or Finance can
 *    allow it on the API Keys page."
 *
 * so we surface that code verbatim instead of pretending the payout happened.
 */

/** BD wallet → PayWise payout slug. Only these three are wired for payouts. */
export const PAYWISE_PAYOUT_SYSTEMS: Record<string, string> = {
  bKash: "BKASH",
  Nagad: "NAGAD",
};

export interface PayoutResult {
  ok: boolean;
  httpStatus: number;
  /** PayWise's own withdrawal id, when one was actually created. */
  withdrawalId?: string;
  status?: string;
  /** Not enabled on the key / not enough balance / bad input. */
  code?: string;
  message?: string;
}

/**
 * Ask PayWise to send `amountCents` to a Bangladeshi wallet.
 *
 * Never call this without having debited the player first — a successful call
 * moves real money, and there is no client-side undo.
 */
export async function createWithdrawal(opts: {
  /** Stable per-request idempotency key; retries must reuse this exact value. */
  withdrawalId: string;
  amountCents: number;
  accountNumber: string;
  accountHolder: string;
  /** PayWise LOCAL BDT bank code: BKASH or NAGAD. */
  paymentSystem: string;
}): Promise<PayoutResult> {
  if (!isConfigured()) return { ok: false, httpStatus: 0, code: "paywise_not_configured", message: "PAYWISE_API_KEY is not set" };
  if (!/^wd_[A-Za-z0-9_-]{5,61}$/.test(opts.withdrawalId)) return { ok: false, httpStatus: 0, code: "INVALID_IDEMPOTENCY_KEY", message: "invalid payout idempotency key" };
  if (!Number.isInteger(opts.amountCents) || opts.amountCents < 50000) return { ok: false, httpStatus: 0, code: "INVALID_AMOUNT", message: "BDT payout must be at least 500.00 with at most two decimal places" };
  if (!/^(BKASH|NAGAD)$/.test(opts.paymentSystem) || !opts.accountHolder.trim() || !opts.accountNumber) return { ok: false, httpStatus: 0, code: "INVALID_DESTINATION", message: "supported rail, account number, and account holder are required" };
  const body = {
    payment_method: "LOCAL",
    currency: "BDT",
    amount: opts.amountCents / 100,
    bank_code: opts.paymentSystem,
    account_number: opts.accountNumber,
    account_holder: opts.accountHolder.trim().slice(0, 100),
  };
  try {
    const r = await call("/withdrawals", {
      method: "POST",
      headers: { "Idempotency-Key": opts.withdrawalId },
      body: JSON.stringify(body),
    });
    const data = r.json?.data ?? r.json?.withdrawal ?? r.json;
    if (r.status >= 200 && r.status < 300 && (r.json?.success ?? true)) {
      return { ok: true, httpStatus: r.status, withdrawalId: String(data?.reference ?? data?.id ?? ""), status: String(data?.status ?? "requested") };
    }
    return { ok: false, httpStatus: r.status, code: r.json?.error?.code || r.json?.code || `http_${r.status}`, message: r.json?.error?.message || r.json?.message || "PayWise refused the withdrawal" };
  } catch (e: any) {
    // Ambiguous network failure: do not retry with a new key or mark paid.
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }
}

/**
 * What the merchant account can actually pay out right now.
 *
 * PayWise's BDT wallet has its own floor and ceiling (min 500, max 2000 at the time
 * of writing) and only pays from *settled* funds. Asking for a payout that breaks
 * either rule wastes a round-trip and leaves the request in PENDING for no reason, so
 * we read this first and let the admin handle anything the rail cannot take.
 */
export interface PayoutBalance {
  ok: boolean;
  httpStatus: number;
  /** Settled, spendable amount in the payout currency. */
  available?: number;
  /** The most we can withdraw right now (available minus any hold). */
  maxWithdrawal?: number;
  min?: number;
  max?: number;
  code?: string;
  message?: string;
}

export async function getPayoutBalance(currency = "LOCAL_BDT"): Promise<PayoutBalance> {
  if (!isConfigured()) return { ok: false, httpStatus: 0, code: "paywise_not_configured" };
  try {
    const r = await call("/balance", { method: "GET" });
    const m = r.json?.data?.methods?.[currency];
    if (!m) {
      return { ok: false, httpStatus: r.status, code: "NO_METHOD", message: `no ${currency} payout method on the account` };
    }
    return {
      ok: true,
      httpStatus: r.status,
      available: Number(m.available ?? 0),
      maxWithdrawal: Number(m.max_withdrawal ?? m.available ?? 0),
      min: Number(m.withdrawal?.min ?? 0),
      max: Number(m.withdrawal?.max ?? 0),
    };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, code: "NETWORK", message: e?.message || "could not reach PayWise" };
  }
}
