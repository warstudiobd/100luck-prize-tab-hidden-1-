import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { createWithdrawal, getPayoutBalance, PAYWISE_PAYOUT_SYSTEMS, isConfigured as paywiseConfigured } from "@/lib/paywise";
import { getWithdrawRequirement } from "@/lib/settings";
import { getRules } from "@/lib/rules-server";
import { verifyPin } from "@/lib/withdraw-pin";

export const dynamic = "force-dynamic";

type ChannelRow = {
  channel: string; is_active: boolean; min_amount_cents: number | string; max_amount_cents: number | string;
  for_payout: boolean;
};

/** Channels are admin-managed rows, so any gateway (bKash, Nagad, a new
 *  payment company, …) works without a code change. Falls back to the three
 *  legacy wallets if the table is unreachable. */
async function loadChannel(name: string): Promise<ChannelRow | null> {
  try {
    const [row] = await query(
      "SELECT channel, is_active, min_amount_cents, max_amount_cents, COALESCE(for_payout, TRUE) AS for_payout FROM deposit_channels WHERE channel = $1",
      [name]
    );
    return (row as ChannelRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * Try to pay a withdrawal out through PayWise.
 *
 * Returns one of:
 *   "paid"        — PayWise accepted the payout and it is on its way
 *   "over_limit"  — above the auto ceiling, left for an admin
 *   "not_enabled" — the API key may not request withdrawals (WITHDRAW_NOT_ENABLED)
 *   "failed"      — PayWise rejected it; left PENDING for manual handling
 *   "skipped"     — the channel has no payout rail, or PayWise is not configured
 *
 * The player's balance was already debited before this runs, so a failure here can
 * never leave money both sent and still in the wallet. We only ever move a request
 * to PAID after PayWise confirms it, and we record the payout id + the raw reason
 * so an operator can reconcile with the PayWise dashboard.
 */
/** Writes the reason a withdrawal was NOT auto-paid, so the admin sees it in the row. */
async function noteHold(requestId: number, detail: string) {
  if (!requestId || !detail) return;
  await query("UPDATE cashier_requests SET trx_ref = $1 WHERE id = $2 AND status = 'PENDING'",
    [`AUTO-HOLD ${detail}`.slice(0, 240), requestId]).catch(() => {});
}

async function tryAutoPayout(opts: {
  requestId: number;
  channel: string;
  accountNumber: string;
  accountHolder: string;
  amountCents: number;
}): Promise<{ state: "submitted" | "paid" | "over_limit" | "not_enabled" | "failed" | "skipped"; detail?: string }> {
  if (!opts.requestId) return { state: "skipped", detail: "no request id" };
  if (!paywiseConfigured()) return { state: "skipped", detail: "paywise not configured" };

  // Only wallets PayWise can actually pay out to.
  const system = PAYWISE_PAYOUT_SYSTEMS[opts.channel];
  if (!system) return { state: "skipped", detail: `${opts.channel} has no payout rail` };
  if (opts.amountCents < 50000) {
    await noteHold(opts.requestId, "PayWise LOCAL BDT payouts require at least ৳500");
    return { state: "over_limit", detail: "PayWise requires payouts of at least ৳500" };
  }
  if (!opts.accountHolder.trim()) {
    await noteHold(opts.requestId, "missing bound wallet account-holder name; update binding before payout");
    return { state: "skipped", detail: "wallet account-holder name missing" };
  }

  // Admin-tunable ceiling. 0 or a missing row means "never pay out automatically".
  let ceilingCents = 0;
  try {
    const [row] = await query("SELECT value FROM platform_settings WHERE key = 'withdraw_auto_max_cents'");
    ceilingCents = row?.value != null ? Math.max(0, Math.trunc(Number(row.value))) : 0;
  } catch { ceilingCents = 0; }
  if (ceilingCents <= 0) return { state: "over_limit", detail: "auto payout disabled" };
  if (opts.amountCents > ceilingCents) {
    const d = `over auto limit ৳${(ceilingCents / 100).toLocaleString()}`;
    await noteHold(opts.requestId, d);
    return { state: "over_limit", detail: d };
  }

  /* PayWise pays only from SETTLED merchant funds, and the BDT rail has its own
   * floor (min ৳500) and ceiling (৳2,000) that are independent of ours. Check both
   * before calling out: a payout the rail cannot fund must stay PENDING for an admin
   * instead of failing on the provider side and puzzling the player.
   *
   * If /balance is unreachable we still attempt the payout — a network blip on a read
   * should not block a legitimate withdrawal. */
  const bal = await getPayoutBalance("LOCAL_BDT");
  if (bal.ok) {
    const taka = opts.amountCents / 100;
    if (bal.min && taka < bal.min) {
      const d = `below PayWise minimum ৳${bal.min}`;
      await noteHold(opts.requestId, d);
      return { state: "over_limit", detail: d };
    }
    if (bal.max && taka > bal.max) {
      const d = `above PayWise maximum ৳${bal.max}`;
      await noteHold(opts.requestId, d);
      return { state: "over_limit", detail: d };
    }
    const usable = Number(bal.maxWithdrawal ?? bal.available ?? 0);
    if (usable < taka) {
      const d = `merchant balance ৳${usable} too low for ৳${taka}`;
      await noteHold(opts.requestId, d);
      return { state: "over_limit", detail: d };
    }
  }

  const res = await createWithdrawal({
    withdrawalId: `wd_${String(opts.requestId).padStart(5, "0")}`,
    amountCents: opts.amountCents,
    accountNumber: opts.accountNumber,
    accountHolder: opts.accountHolder,
    paymentSystem: system,
  });

  if (res.ok) {
    // Provider acceptance is not settlement. Keep PENDING until the signed
    // withdrawal.completed webhook arrives with this exact PWD reference.
    if (!res.withdrawalId || !/^PWD/i.test(res.withdrawalId)) {
      await noteHold(opts.requestId, "PayWise accepted request but returned no PWD reference; reconcile manually");
      return { state: "failed", detail: "missing PayWise withdrawal reference" };
    }
    await query(
      "UPDATE cashier_requests SET trx_ref = $1 WHERE id = $2 AND request_type = 'WITHDRAW' AND status = 'PENDING'",
      [res.withdrawalId, opts.requestId]
    );
    return { state: "submitted", detail: res.withdrawalId };
  }

  // Record why, so the admin sees the truth instead of a silent PENDING.
  const reason = `${res.code || "error"}: ${res.message || ""}`.slice(0, 240);
  await query(
    "UPDATE cashier_requests SET trx_ref = $1 WHERE id = $2",
    [`AUTO-FAILED ${reason}`, opts.requestId]
  ).catch(() => {});

  if (res.code === "WITHDRAW_NOT_ENABLED") return { state: "not_enabled", detail: reason };
  return { state: "failed", detail: reason };
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = String(body.request_type ?? "").toUpperCase();
  const channel = String(body.channel ?? "").trim().slice(0, 16);
  const amount = Math.trunc(Number(body.amount_cents));
  const accountId = Math.trunc(Number(body.account_id ?? 0));
  let accountRef = String(body.account_ref ?? "").trim().slice(0, 64);
  const trxRef = String(body.trx_ref ?? "").trim().slice(0, 64);

  if (type !== "DEPOSIT" && type !== "WITHDRAW") return NextResponse.json({ ok: false, error: "request_type must be DEPOSIT or WITHDRAW" }, { status: 400 });

  // A withdrawal names a *bound* wallet by id; the full number is read from the
  // database here so it never has to travel to (or from) the browser.
  if (type === "WITHDRAW" && Number.isFinite(accountId) && accountId > 0) {
    try {
      const [bound] = await query(
        "SELECT account_number FROM payout_accounts WHERE id = $1 AND user_id = $2",
        [accountId, sess.sub]
      );
      if (bound?.account_number) accountRef = String(bound.account_number);
      else return NextResponse.json({ ok: false, error: "That wallet is not bound to your account", code: "account_not_bound" }, { status: 400 });
    } catch {
      // Migration missing → fall through to whatever the client sent.
    }
  }
  if (!channel) return NextResponse.json({ ok: false, error: "channel is required" }, { status: 400 });
  // Every withdrawal needs the player's withdrawal PIN — verified before the turnover
  // check so a wrong PIN never reveals whether the balance/turnover would allow a payout.
  if (type === "WITHDRAW") {
    const pinCheck = await verifyPin(Number(sess.sub), String(body.pin ?? "").trim());
    if (!pinCheck.ok) {
      return NextResponse.json(
        { ok: false, error: pinCheck.error, code: pinCheck.code, retry_after_seconds: pinCheck.retry_after_seconds },
        { status: pinCheck.code === "pin_locked" ? 429 : pinCheck.code === "pin_wrong" ? 403 : 400 }
      );
    }
  }
  // Floors come from lib/rules.ts / platform_settings so the UI and the server
  // can never disagree about the minimum withdrawal.
  const { withdraw_min_amount_cents: MIN_AMT, withdraw_max_amount_cents: MAX_AMT } = await getRules();
  if (!Number.isFinite(amount) || amount < MIN_AMT || amount > MAX_AMT) {
    return NextResponse.json(
      { ok: false, error: `amount must be between ৳${(MIN_AMT / 100).toLocaleString("en-IN")} and ৳${(MAX_AMT / 100).toLocaleString("en-IN")}` },
      { status: 400 }
    );
  }
  if (type === "DEPOSIT" && trxRef.length < 4) return NextResponse.json({ ok: false, error: "TrxID is required for deposits (min 4 chars)" }, { status: 400 });
  if (type === "WITHDRAW" && !/^01[3-9]\d{8}$/.test(accountRef)) return NextResponse.json({ ok: false, error: "Enter a valid BD wallet number (01XXXXXXXXX)" }, { status: 400 });

  const dc = await loadChannel(channel);
  // is_active governs whether the player may DEPOSIT into this row. A payout rail is a
  // separate concept: it exists so the operator can pay the player by hand, so the only
  // check that applies to a withdrawal is for_payout.
  if (dc && type === "DEPOSIT" && !dc.is_active) {
    return NextResponse.json({ ok: false, error: `${channel} is temporarily unavailable` }, { status: 400 });
  }
  if (dc && type === "WITHDRAW" && !dc.for_payout) {
    return NextResponse.json({ ok: false, error: `${channel} is not available for withdrawals` }, { status: 400 });
  }
  if (dc && type === "WITHDRAW") {
    const minW = Number(dc.min_amount_cents), maxW = Number(dc.max_amount_cents);
    if (Number.isFinite(minW) && minW > 0 && amount < minW) {
      return NextResponse.json({ ok: false, error: `Minimum withdrawal for ${channel} is ৳${(minW / 100).toLocaleString()}` }, { status: 400 });
    }
    if (Number.isFinite(maxW) && maxW > 0 && amount > maxW) {
      return NextResponse.json({ ok: false, error: `Maximum withdrawal for ${channel} is ৳${(maxW / 100).toLocaleString()}` }, { status: 400 });
    }
  }
  if (dc && type === "DEPOSIT") {
    const minC = Number(dc.min_amount_cents), maxC = Number(dc.max_amount_cents);
    if (Number.isFinite(minC) && amount < minC) return NextResponse.json({ ok: false, error: `Minimum deposit for ${channel} is ৳${(minC / 100).toLocaleString()}` }, { status: 400 });
    if (Number.isFinite(maxC) && amount > maxC) return NextResponse.json({ ok: false, error: `Maximum deposit for ${channel} is ৳${(maxC / 100).toLocaleString()}` }, { status: 400 });
  }

  if (type === "DEPOSIT") {
    const ins = await query(
      `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
       VALUES ($1,'DEPOSIT',$2,$3,$4,$5,'PENDING') RETURNING id, created_at`,
      [sess.sub, channel, accountRef, trxRef, amount]
    );
    return NextResponse.json({ ok: true, request: ins[0], message: "Deposit request submitted — awaiting admin approval" });
  }

  // ── WITHDRAW ──────────────────────────────────────────────────────────
  // Turnover guard (flat requirement, admin-editable): players must have
  // wagered the required amount in game bets before cashing out.

  // ── Bound-wallet guard ────────────────────────────────────────────────
  // Money may only be paid to a number the player has bound in
  // "ই-ওয়ালেট বাঁধুন" for that gateway. This is the server-side half of the
  // rule — the UI already restricts the picker, but the API is what enforces it.
  let bound: string[] = [];
  let boundAccountHolder = "";
  try {
    const rows = await query(
      "SELECT account_number, account_holder FROM payout_accounts WHERE user_id = $1 AND channel = $2",
      [sess.sub, channel]
    );
    const payoutAccounts = rows as unknown as { account_number: string; account_holder?: string | null }[];
    bound = payoutAccounts.map(r => r.account_number);
    boundAccountHolder = payoutAccounts.find(r => r.account_number === accountRef)?.account_holder || "";
  } catch {
    // Migration not applied → fall back to the old behaviour rather than
    // blocking every payout with a confusing error.
    bound = [accountRef];
  }
  // If nothing is bound for this rail yet, the client-side flow sends the player to bind
  // a number first; the request itself only fails when it names a number that is bound to
  // somebody else / not bound at all.
  if (bound.length && !bound.includes(accountRef)) {
    return NextResponse.json(
      {
        ok: false,
        error: bound.length
          ? `Withdrawals can only go to a ${channel} number bound to your account`
          : `Bind a ${channel} number first (ই-ওয়ালেট বাঁধুন), then withdraw to it`,
        code: "account_not_bound",
      },
      { status: 400 }
    );
  }

  // ── Daily withdrawal cap (platform setting, default effectively unlimited) ──
  try {
    const [limitRow] = await query("SELECT value FROM platform_settings WHERE key = 'withdraw_daily_limit'");
    const limit = limitRow?.value != null ? Math.max(0, Math.trunc(Number(limitRow.value))) : 99999;
    const [todayRow] = await query(
      `SELECT COUNT(*)::int AS n FROM cashier_requests
        WHERE user_id = $1 AND request_type = 'WITHDRAW' AND status <> 'REJECTED'
          AND (created_at AT TIME ZONE 'Asia/Dhaka')::date = (now() AT TIME ZONE 'Asia/Dhaka')::date`,
      [sess.sub]
    );
    if (Number(todayRow?.n ?? 0) >= limit) {
      return NextResponse.json(
        { ok: false, error: `Daily withdrawal limit reached (${limit}/day)`, code: "daily_limit" },
        { status: 429 }
      );
    }
  } catch { /* settings table missing → no cap */ }

  const turnover = await getWithdrawRequirement(Number(sess.sub));
  if (!turnover.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Turnover requirement not met — ৳${(turnover.remainingCents / 100).toLocaleString()} more wagering needed (৳${(turnover.wageredCents / 100).toLocaleString()} of ৳${(turnover.requiredCents / 100).toLocaleString()})`,
        turnover,
      },
      { status: 400 }
    );
  }

  // Funds are held immediately; refunded on rejection by the admin decision route.
  const outcome = await withTransaction(async (client) => {
    const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [sess.sub]);
    const before = Number(locked.rows[0]?.balance_cents ?? -1);
    if (before < amount) return { error: "Insufficient balance", balance: before };
    const after = before - amount;
    await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, sess.sub]);
    await client.query(
      `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype, amount_cents, balance_before_cents, balance_after_cents)
       VALUES ($1,$2,'CASHIER','', 'WITHDRAW','withdraw_request',$3,$4,$5)`,
      [`csh_wd_req_${crypto.randomUUID()}`, sess.sub, amount, before, after]
    );
    const ins = await client.query(
      `INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
       VALUES ($1,'WITHDRAW',$2,$3,'',$4,'PENDING') RETURNING id, created_at`,
      [sess.sub, channel, accountRef, amount]
    );
    return { request: ins.rows[0], balance: after };
  });

  if ((outcome as any).error) return NextResponse.json({ ok: false, error: (outcome as any).error, balance_cents: (outcome as any).balance }, { status: 400 });

  const requestId = Number((outcome as any).request?.id ?? 0);

  /* ── Auto-payout ───────────────────────────────────────────────────────
   *
   * Small withdrawals pay out by themselves; anything above the configured
   * ceiling waits for admin approval. The player's funds are ALREADY debited
   * above, so every failure path here is safe by default: the request simply
   * stays PENDING and an admin can approve or reject it by hand. Nothing marks
   * money as sent unless PayWise actually accepted the payout.
   */
  const payout = await tryAutoPayout({
    requestId,
    channel,
    accountNumber: accountRef,
    accountHolder: boundAccountHolder,
    amountCents: amount,
  });

  return NextResponse.json({
    ok: true,
    request: (outcome as any).request,
    balance_cents: (outcome as any).balance,
    auto_payout: payout.state,
    message: payout.state === "submitted"
      ? "Payout request accepted by PayWise — awaiting final confirmation"
      : payout.state === "failed"
        ? "Withdrawal submitted — waiting for admin approval"
        : payout.state === "not_enabled"
          ? "Withdrawal submitted — PayWise payouts are not enabled on the API key yet"
          : "Withdrawal request submitted — funds held until processed",
  });
}
