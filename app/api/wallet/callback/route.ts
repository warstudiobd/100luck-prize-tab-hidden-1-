/**
 * SoftAggregator → operator SEAMLESS WALLET callback.
 * Docs: GET {callback}?username=...&currency=EUR&action=balance|debit|credit&amount=<cents>&type=...&round_id=...&game_id=<id_hash>&call_id=...&timestamp=...&rb=0|1&key=md5(timestamp+SALT)
 * Also carries X-Signature: hex HMAC-SHA256(SALT, sorted name=value&... including key).
 * ALWAYS return HTTP 200 with { error, balance }. error: 0 ok · 1 insufficient · 2 processing/signature/user error.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processWalletAction, WALLET_ERR, type WalletAction } from "@/lib/wallet";
import { ipAllowed, clientIp } from "@/lib/ip";

export const dynamic = "force-dynamic";

const SALT = process.env.SOFTAGG_SALT_KEY || "";
const WINDOW_S = Number(process.env.SOFTAGG_TIMESTAMP_WINDOW_SECONDS || 30);

function parseTimestamp(ts: any): number | null {
  if (ts === undefined || ts === null || ts === "") return null;
  const n = Number(ts);
  if (Number.isFinite(n)) {
    if (n > 1e12) return Math.floor(n / 1000); // epoch milliseconds
    if (n > 1e9) return Math.floor(n);          // epoch seconds
  }
  const d = Date.parse(String(ts));
  return Number.isFinite(d) ? Math.floor(d / 1000) : null;
}
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
const hmacSha256 = (s: string) => crypto.createHmac("sha256", SALT).update(s).digest("hex");
function safeEqualHex(a: string, b: string) {
  try {
    const ba = Buffer.from(String(a).toLowerCase(), "hex");
    const bb = Buffer.from(String(b).toLowerCase(), "hex");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
const respond = (error: number, balance: number) =>
  NextResponse.json({ error, balance: Number.isFinite(balance) ? Math.max(0, Math.trunc(balance)) : 0 },
    { status: 200, headers: { "cache-control": "no-store" } });

async function paramsFromRequest(req: NextRequest): Promise<Record<string, string>> {
  if (req.method === "GET" || req.method === "HEAD") {
    const out: Record<string, string> = {};
    new URL(req.url).searchParams.forEach((v, k) => { out[k] = v; });
    return out;
  }
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const out: Record<string, string> = {};
    const text = await req.text();
    new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
    return out;
  }
  const body = await req.json().catch(() => ({}));
  const out: Record<string, string> = {};
  if (body && typeof body === "object") for (const [k, v] of Object.entries(body)) out[k] = v === undefined || v === null ? "" : String(v);
  return out;
}

function signedPayloadString(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([k, v]) => k.toLowerCase() !== "x-signature" && v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  // Docs: all callbacks come from one fixed IPv4; set SOFTAGG_IP_ALLOWLIST=85.122.129.59 in prod.
  if (!ipAllowed(req)) {
    console.warn(`[softaggregator callback] rejected source ${clientIp(req) || "unknown"}`);
    return respond(2, 0);
  }
  const params = await paramsFromRequest(req);
  if (!SALT) return respond(2, 0); // fail closed: cannot validate md5(timestamp+salt)

  const tsRaw = params.timestamp ?? params.ts ?? params.time;
  const ts = parseTimestamp(tsRaw);
  if (ts === null || Math.abs(Math.floor(Date.now() / 1000) - ts) > WINDOW_S) return respond(2, 0);

  const givenKey = String(params.key ?? params.sign ?? params.signature ?? "").trim().toLowerCase();
  if (!givenKey || !safeEqualHex(givenKey, md5(`${tsRaw}${SALT}`))) return respond(2, 0);

  const headerSig = req.headers.get("x-signature");
  if (headerSig && !safeEqualHex(headerSig, hmacSha256(signedPayloadString(params)))) return respond(2, 0);

  const actionRaw = String(params.action ?? params.method ?? "").toLowerCase().trim();
  const action: WalletAction | null =
    actionRaw === "balance" || actionRaw === "getbalance" ? "balance" :
    actionRaw === "debit" ? "debit" :
    actionRaw === "credit" ? "credit" : null;
  if (!action) return respond(2, 0);

  const username = String(params.username ?? params.user_id ?? params.player_id ?? params.player ?? params.uid ?? "").trim();
  if (!username) return respond(2, 0);

  const callId = String(params.call_id ?? params.transaction_id ?? params.tx_id ?? params.trans_id ?? "").trim();
  if (action !== "balance" && !callId) return respond(2, 0);

  let amountCents = 0;
  if (action !== "balance") {
    const rawAmount = params.amount_cents ?? params.amount ?? params.ammount; // tolerate common misspelling in the wild
    amountCents = Math.round(Number(rawAmount));
    if (!Number.isFinite(amountCents) || amountCents < 0) return respond(2, 0);
  }

  const rb = Number(params.rb ?? params.rollback ?? 0) === 1 ? 1 : 0;
  const gameId = String(params.game_id ?? params.gameid ?? params.game ?? "").slice(0, 64);
  const txSubtype = String(params.type ?? params.tx_subtype ?? (rb === 1 ? "rollback" : action)).slice(0, 32);

  const result = await processWalletAction({
    callId: callId || null,
    userRef: username,
    action,
    amountCents,
    rb,
    providerCode: "SOFTAGG",
    gameCode: gameId,
    txSubtype,
  });

  if (!result.ok) {
    if (result.errorCode === WALLET_ERR.NO_FUNDS) return respond(1, result.balance ?? 0);
    return respond(2, result.balance ?? 0);
  }
  return respond(0, result.balance ?? 0);
}
