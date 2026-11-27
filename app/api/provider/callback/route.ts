/** Seamless-wallet callback for admin-added providers.
 *
 *  One endpoint serves every provider:  POST /api/provider/callback?p=CODE
 *
 *  The provider row decides the auth type (hmac/bearer/basic/query) and the
 *  secret, so adding "FC Gaming" in the admin panel makes this URL live for
 *  them immediately — nothing to deploy.
 *
 *  Accepted payload (aliases in brackets):
 *    { player|user|player_id, action|type|cmd (balance|debit|credit),
 *      amount|amount_cents, call_id|transaction_id|ref, game|game_code,
 *      rb? }
 *
 *  Response mirrors the SoftAggregator contract so one integration doc works
 *  for all providers: { code|errorCode, message|msg, balance }.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { getProviderSecrets } from "@/lib/provider-auth";
import { processWalletAction, type WalletAction } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const MAX_SKEW_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, service: "sonali7-seamless-wallet", hint: "POST balance/debit/credit with ?p=PROVIDER_CODE" });
}

export async function POST(req: NextRequest) {
  const code = String(new URL(req.url).searchParams.get("p") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ code: 5, message: "missing provider (?p=CODE)" }, { status: 400 });

  const [provider] = await query(
    "SELECT code, auth_type, api_config, is_active FROM game_providers WHERE code = $1",
    [code]
  );
  if (!provider) return NextResponse.json({ code: 3, message: "unknown provider" }, { status: 404 });
  if (!provider.is_active) return NextResponse.json({ code: 6, message: "provider disabled" }, { status: 403 });

  const raw = await req.text();
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ code: 5, message: "invalid JSON" }, { status: 400 }); }

  const secrets = await getProviderSecrets(code);
  if (!secrets.key) return NextResponse.json({ code: 1, message: "provider secret not configured" }, { status: 401 });

  const authType = String(provider.auth_type || "hmac").toLowerCase();
  const ts = String(req.headers.get("x-timestamp") ?? "");
  if (ts) {
    const skew = Math.abs(Date.now() - Number(ts));
    if (!Number.isFinite(skew) || skew > MAX_SKEW_MS) {
      return NextResponse.json({ code: 2, message: "stale timestamp" }, { status: 401 });
    }
  }

  // Auth check — every mode ends in a constant-time comparison.
  let authed = false;
  if (authType === "basic") {
    const header = String(req.headers.get("authorization") ?? "");
    const expected = `Basic ${Buffer.from(`${secrets.keyId}:${secrets.key}`).toString("base64")}`;
    authed = timingSafeEqual(header, expected);
  } else if (authType === "query") {
    const url = new URL(req.url);
    authed = timingSafeEqual(String(url.searchParams.get("token") ?? ""), secrets.key);
  } else {
    const sig = String(req.headers.get("x-signature") ?? "");
    const candidates = [
      crypto.createHmac("sha256", secrets.key).update(`${ts}.${raw}`).digest("hex"),
      crypto.createHmac("sha256", secrets.key).update(raw).digest("hex"),
      crypto.createHmac("sha256", secrets.key).update(`${JSON.stringify(body)}.${ts}`).digest("hex"),
    ];
    authed = candidates.some((c) => c && timingSafeEqual(sig, c));
    if (!authed && authType === "bearer") {
      authed = timingSafeEqual(String(req.headers.get("authorization") ?? ""), `Bearer ${secrets.key}`);
    }
  }
  if (!authed) return NextResponse.json({ code: 1, message: "invalid signature" }, { status: 401 });

  const playerRef = body.player ?? body.user ?? body.user_id ?? body.player_id ?? body.username;
  const actionRaw = String(body.action ?? body.type ?? body.cmd ?? "").toLowerCase();
  const action: WalletAction = actionRaw === "debit" ? "debit" : actionRaw === "credit" ? "credit" : actionRaw === "balance" ? "balance" : "balance";
  if (!playerRef) return NextResponse.json({ code: 5, message: "player is required" }, { status: 400 });

  const amountCents = Math.trunc(Number(body.amount_cents ?? body.amount ?? 0));
  const callId = body.call_id ?? body.transaction_id ?? body.ref ?? body.txid ?? null;
  const gameCode = body.game ?? body.game_code ?? body.gameCode ?? "";

  const result = await processWalletAction({
    callId: callId ? String(callId) : null,
    userRef: String(playerRef),
    action,
    amountCents,
    rb: Number(body.rb ?? 0) === 1 ? 1 : 0,
    providerCode: code,
    gameCode: String(gameCode),
    txSubtype: String(body.tx_subtype ?? (action === "credit" ? "win" : action === "debit" ? "bet" : "balance")),
  });

  return NextResponse.json(
    {
      code: result.errorCode ?? (result.ok ? 0 : 6),
      errorCode: result.errorCode ?? (result.ok ? 0 : 6),
      message: result.message,
      msg: result.message,
      balance: result.balance ?? 0,
    },
    { status: result.ok ? 200 : result.errorCode === ERR_STATUS.STALE ? 401 : 200 }
  );
}

const ERR_STATUS = { STALE: 2 } as const;
