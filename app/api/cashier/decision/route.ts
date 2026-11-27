/**
 * Admin decision endpoint — approve/reject pending cashier requests.
 * Row-locks the request (FOR UPDATE), verifies it is still PENDING, then:
 *   DEPOSIT + APPROVE → credit user (ledger, idempotent call_id csh_dep_appr_<id>)
 *   WITHDRAW + REJECT → refund held funds (ledger, idempotent call_id csh_wd_refund_<id>)
 *   WITHDRAW + APPROVE → mark APPROVED (funds were already debited at request time)
 *   DEPOSIT + REJECT   → mark REJECTED (no funds moved)
 */
import { NextRequest } from "next/server";
import { withTransaction } from "@/lib/db";
import { corsJson, corsError, corsPreflight, resolveAdmin } from "@/lib/admin-http";
import { applyApprovedDepositTx } from "@/lib/deposits";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const admin = await resolveAdmin(req);
  if (!admin) return corsError("admin only", 403);

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const decision = String(body.decision ?? "").toUpperCase();
  if (!Number.isInteger(id) || (decision !== "APPROVE" && decision !== "REJECT")) {
    return corsError("id + decision (APPROVE|REJECT) required", 400);
  }

  const out = await withTransaction(async (client) => {
    const reqRow = await client.query("SELECT * FROM cashier_requests WHERE id = $1 FOR UPDATE", [id]);
    const cr = reqRow.rows[0];
    if (!cr) return { status: 404 as const, error: "request not found" };
    if (cr.status !== "PENDING") return { status: 409 as const, error: `already ${cr.status.toLowerCase()}`, request_status: cr.status };
    const userId = Number(cr.user_id);
    const amount = Number(cr.amount_cents);
    const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const before = Number(locked.rows[0].balance_cents);

    let after = before;
    let referral: { paid: boolean; referrerId?: number; amountCents?: number } = { paid: false };
    let newStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";

    if (cr.request_type === "DEPOSIT" && decision === "APPROVE") {
      const res = await applyApprovedDepositTx(client, { requestId: id, userId, amountCents: amount, balanceBefore: before });
      after = res.balance_cents;
      referral = res.referral;
    } else {
      if (cr.request_type === "WITHDRAW" && decision === "REJECT") {
        after = before + amount;
        await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, userId]);
        await client.query(
          `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype, amount_cents, balance_before_cents, balance_after_cents)
           VALUES ($1,$2,'CASHIER','','CREDIT','withdraw_refund',$3,$4,$5)
           ON CONFLICT (call_id) DO NOTHING`,
          [`csh_wd_refund_${id}`, userId, amount, before, after]
        );
      }
      await client.query("UPDATE cashier_requests SET status = $1 WHERE id = $2", [newStatus, id]);
    }
    return { status: 200 as const, request_status: newStatus, balance_cents: after, referral_bonus_paid: referral.paid, referral_referrer_id: referral.referrerId ?? null };
  });

  if (out.status !== 200) return corsJson({ ok: false, ...out }, out.status);
  return corsJson({ ok: true, ...out });
}
