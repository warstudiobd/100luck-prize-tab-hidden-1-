/**
 * Bound payout wallets ("ই-ওয়ালেট বাঁধুন").
 *
 *   GET    → the wallet this player has bound, grouped per channel, masked
 *            (01711••••593) — the full number never leaves the server.
 *   POST   → bind THE number for a channel, once. One bKash, one Nagad, one Upay.
 *   DELETE → gone on purpose. A bound payout number is permanent: the player
 *            cannot remove it and no API can. (Operators can still fix a genuine
 *            mistake in the database.)
 *
 * Ownership rules, enforced here AND by unique indexes in the database:
 *   • a number can be bound to one player per gateway, once — the same bKash
 *     number cannot be added twice, nor used by a second account;
 *   • the same 01XXXXXXXXX may still be bound on a different gateway (bKash for
 *     one player, Nagad for another) — that is legitimate;
 *   • past withdrawals are paid to the number stored on the request, so nothing
 *     historical changes when a binding is locked.
 *
 * A withdrawal may only go to a number bound here — that is checked again in
 * /api/cashier/request, not just in the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyPin } from "@/lib/withdraw-pin";

export const dynamic = "force-dynamic";

/** One payout number per gateway: bKash, Nagad, Upay — no second number, ever. */
export const MAX_ACCOUNTS_PER_CHANNEL = 1;

type Row = { id: number; channel: string; account_number: string; is_primary: boolean; created_at: string };

/** 01711234593 → 01711••••593 (keep the first 5 and last 3 digits). */
export function maskNumber(n: string): string {
  const digits = n.replace(/\D/g, "");
  if (digits.length <= 8) return digits.replace(/.(?=.{3})/g, "•");
  return `${digits.slice(0, 5)}${"•".repeat(Math.max(0, digits.length - 8))}${digits.slice(-3)}`;
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    // Payout rails only (bKash / Nagad / Upay). Any historical row on a collection
    // gateway such as PayWise is not a payout wallet and is never shown or counted.
    const rows = (await query(
      `SELECT id, channel, account_number, is_primary, created_at
         FROM payout_accounts
        WHERE user_id = $1 AND channel <> 'PayWise'
        ORDER BY is_primary DESC, created_at ASC`,
      [sess.sub]
    )) as unknown as Row[];

    return NextResponse.json({
      ok: true,
      max_per_channel: MAX_ACCOUNTS_PER_CHANNEL,
      accounts: rows.map(r => ({
        id: Number(r.id),
        channel: r.channel,
        masked: maskNumber(r.account_number),
        last4: r.account_number.replace(/\D/g, "").slice(-4),
        is_primary: !!r.is_primary,
        created_at: r.created_at,
      })),
    });
  } catch {
    // Migration not applied → behave like "nothing bound yet" instead of a 500
    return NextResponse.json({ ok: true, max_per_channel: MAX_ACCOUNTS_PER_CHANNEL, accounts: [] });
  }
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "").trim().slice(0, 16);
  const number = String(body.account_number ?? "").replace(/\D/g, "").slice(0, 11);
  const makePrimary = body.primary === true;
  /** Second lock: a payout wallet cannot be added without the player's withdrawal PIN. */
  const pin = String(body.pin ?? "").trim();

  if (!channel) return NextResponse.json({ ok: false, error: "channel is required" }, { status: 400 });
  if (!/^01[3-9]\d{8}$/.test(number)) {
    return NextResponse.json({ ok: false, error: "enter a valid BD wallet number (01XXXXXXXXX)" }, { status: 400 });
  }
  // The PIN gate comes before anything is stored, so a hijacked session cannot quietly
  // swap the payout number to its own wallet.
  const pinCheck = await verifyPin(Number(sess.sub), pin);
  if (!pinCheck.ok) {
    return NextResponse.json(
      { ok: false, error: pinCheck.error, code: pinCheck.code, retry_after_seconds: pinCheck.retry_after_seconds },
      { status: pinCheck.code === "pin_locked" ? 429 : pinCheck.code === "pin_wrong" ? 403 : 400 }
    );
  }

  // A payout rail only has to be marked for_payout — it is NOT a deposit channel, so it
  // is normally inactive for deposits (is_active = FALSE) and has no collection number.
  // Requiring is_active here made bKash/Nagad/Upay unbindable the moment the deposit
  // placeholder rows were retired.
  try {
    const ch = await query(
      "SELECT channel FROM deposit_channels WHERE channel = $1 AND COALESCE(for_payout, TRUE) = TRUE",
      [channel]
    );
    if (!ch.length) return NextResponse.json({ ok: false, error: `${channel} is not available for payouts` }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "channels unavailable — try again" }, { status: 503 });
  }

  const existing = (await query(
    "SELECT id, account_number, is_primary FROM payout_accounts WHERE user_id = $1 AND channel = $2 ORDER BY created_at ASC",
    [sess.sub, channel]
  )) as unknown as Row[];

  // Same player, same number, same gateway → just say it is already theirs.
  if (existing.some(r => r.account_number === number)) {
    return NextResponse.json(
      { ok: false, error: `This ${channel} number is already bound to your account`, code: "already_bound" },
      { status: 409 }
    );
  }

  // The real rule: one payout number (bKash · Nagad · Upay) per account, once bound
  // it is locked. No swapping numbers to dodge a payout trail.
  if (existing.length >= MAX_ACCOUNTS_PER_CHANNEL) {
    const held = maskNumber(existing[0].account_number);
    return NextResponse.json(
      {
        ok: false,
        error: `Your ${channel} wallet is already bound (${held}). A bound number can't be removed or replaced.`,
        code: "channel_locked",
        bound: held,
      },
      { status: 409 }
    );
  }

  // Somebody else already owns this number on this gateway.
  try {
    const taken = (await query(
      "SELECT 1 FROM payout_accounts WHERE channel = $1 AND account_number = $2 AND user_id <> $3 LIMIT 1",
      [channel, number, sess.sub]
    )) as unknown as Row[];
    if (taken.length) {
      return NextResponse.json(
        { ok: false, error: `This ${channel} number is already linked to another account`, code: "number_in_use" },
        { status: 409 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "could not verify the number — try again" }, { status: 503 });
  }

  const first = existing.length === 0;
  const primary = makePrimary || first;

  let inserted;
  try {
    inserted = await query(
      `INSERT INTO payout_accounts (user_id, channel, account_number, is_primary)
       VALUES ($1, $2, $3, $4) RETURNING id, channel, account_number, is_primary, created_at`,
      [sess.sub, channel, number, primary]
    );
  } catch (e) {
    // Unique index from 2026-11-25-payout-account-rules.sql: two requests racing for the
    // same number (or the same gateway) land here instead of silently duplicating.
    if ((e as { code?: string }).code === "23505") {
      return NextResponse.json(
        { ok: false, error: `This ${channel} number or wallet is already bound`, code: "already_bound" },
        { status: 409 }
      );
    }
    throw e;
  }

  if (primary && !first) {
    await query(
      "UPDATE payout_accounts SET is_primary = FALSE WHERE user_id = $1 AND channel = $2 AND id <> $3",
      [sess.sub, channel, inserted[0].id]
    );
  }

  const r = inserted[0] as Row;
  return NextResponse.json({
    ok: true,
    account: {
      id: Number(r.id),
      channel: r.channel,
      masked: maskNumber(r.account_number),
      last4: r.account_number.slice(-4),
      is_primary: !!r.is_primary,
      created_at: r.created_at,
    },
  });
}

export async function DELETE() {
  // Deliberately disabled: a bound payout number is permanent. Players cannot delete a
  // wallet and cannot swap it for a new one — that is the point of binding it.
  return NextResponse.json(
    {
      ok: false,
      error: "A bound payout number can't be removed",
      code: "account_locked",
    },
    { status: 405 }
  );
}

/** Promote an existing binding to primary for its channel. */
export async function PATCH(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.id));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const [row] = (await query("SELECT id, channel FROM payout_accounts WHERE id = $1 AND user_id = $2", [id, sess.sub])) as unknown as Row[];
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  await query("UPDATE payout_accounts SET is_primary = (id = $3) WHERE user_id = $1 AND channel = $2", [sess.sub, row.channel, id]);
  return NextResponse.json({ ok: true });
}
