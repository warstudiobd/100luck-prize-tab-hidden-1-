/**
 * Admin "deduct balance" — cancels money from a player's account.
 *
 * The mirror of /api/admin/credit, but this direction takes real money away from a
 * player, so it is deliberately stricter:
 *
 *   • the admin's own account can never be debited
 *   • the amount must be a positive whole number of poisha
 *   • the balance can never go negative — the deduction is clamped to what is there,
 *     and the response reports exactly how much was actually taken
 *   • a reason is mandatory and is stored with the ledger row, so every deduction is
 *     attributable instead of "money just disappeared"
 *   • everything runs in one transaction with the user row locked FOR UPDATE, so a
 *     simultaneous game bet cannot race the balance to a negative
 *
 * Writes a DEBIT / admin_debit ledger entry (adm_db_*), which is what makes the
 * correction visible in the player's own history and in reconciliation.
 */
import { NextRequest } from "next/server";
import crypto from "crypto";
import { withTransaction } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const target = String(body.username_or_phone ?? "").trim();
  const userIdRaw = Math.trunc(Number(body.user_id ?? 0));
  const amount = Math.trunc(Number(body.amount_cents));
  const note = String(body.note ?? "").trim().slice(0, 64);

  if (!target && !(Number.isFinite(userIdRaw) && userIdRaw > 0)) {
    return corsError("username_or_phone or user_id required", 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return corsError("positive amount_cents required", 400);
  }
  // A reason is mandatory: an unexplained deduction is indistinguishable from theft.
  if (note.length < 3) {
    return corsError("a reason (note) of at least 3 characters is required", 400);
  }

  const out = await withTransaction(async (client) => {
    const u = target
      ? await client.query(
          "SELECT id, username_or_phone, balance_cents, is_admin FROM users WHERE username_or_phone = $1 FOR UPDATE",
          [target]
        )
      : await client.query(
          "SELECT id, username_or_phone, balance_cents, is_admin FROM users WHERE id = $1 FOR UPDATE",
          [userIdRaw]
        );
    if (!u.rows[0]) return { status: 404 as const, error: "user not found" };

    const user = u.rows[0];
    if (user.is_admin) return { status: 400 as const, error: "cannot debit an admin account" };
    if (Number(user.id) === Number(admin.id)) {
      return { status: 400 as const, error: "cannot debit your own account" };
    }

    const before = Number(user.balance_cents);
    if (before <= 0) return { status: 400 as const, error: "this account has no balance to deduct" };

    // Never go negative: take the smaller of the request and what is actually there.
    const taken = Math.min(amount, before);
    const after = before - taken;

    await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, user.id]);
    await client.query(
      `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype, amount_cents, balance_before_cents, balance_after_cents)
       VALUES ($1,$2,'ADMIN','','DEBIT','admin_debit',$3,$4,$5)`,
      [`adm_db_${crypto.randomUUID()}`, user.id, taken, before, after]
    );
    return {
      status: 200 as const,
      user: String(user.username_or_phone),
      requested_cents: amount,
      debited_cents: taken,
      partial: taken < amount,
      balance_cents: after,
      note,
    };
  });

  if (out.status !== 200) return corsError(out.error ?? "debit failed", out.status);
  return corsJson({ ok: true, ...out });
}
