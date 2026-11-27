/** Admin "credit test balance" — grants bonus cents to any user, recorded in the ledger. */
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
  const amount = Math.trunc(Number(body.amount_cents));
  const note = String(body.note ?? "admin_test_credit").slice(0, 32);
  if (!target || !Number.isFinite(amount) || amount <= 0) {
    return corsError("username_or_phone + positive amount_cents required", 400);
  }

  const out = await withTransaction(async (client) => {
    const u = await client.query("SELECT id, balance_cents FROM users WHERE username_or_phone = $1 FOR UPDATE", [target]);
    if (!u.rows[0]) return { status: 404 as const, error: "user not found" };
    const before = Number(u.rows[0].balance_cents);
    const after = before + amount;
    await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, u.rows[0].id]);
    await client.query(
      `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype, amount_cents, balance_before_cents, balance_after_cents)
       VALUES ($1,$2,'ADMIN','','BONUS',$3,$4,$5,$6)`,
      [`adm_cr_${crypto.randomUUID()}`, u.rows[0].id, note, amount, before, after]
    );
    return { status: 200 as const, balance_cents: after };
  });

  if (out.status !== 200) return corsError(out.error ?? "credit failed", out.status);
  return corsJson({ ok: true, balance_cents: out.balance_cents });
}
