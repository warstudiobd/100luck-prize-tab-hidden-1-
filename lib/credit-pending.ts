/**
 * Credit a PENDING deposit exactly once.
 *
 * Both doors into the money — the PayWise webhook and the polling reconcile —
 * go through here, so there is a single place where the lock order lives:
 *
 *   BEGIN
 *     SELECT … FROM cashier_requests WHERE trx_ref = $1 FOR UPDATE
 *     must still be PENDING            (a retry is a no-op, never a second credit)
 *     SELECT balance_cents FROM users WHERE id = … FOR UPDATE
 *     applyApprovedDepositTx           (ledger id csh_dep_appr_<requestId>)
 *   COMMIT
 */
import { withTransaction } from "./db";
import { applyApprovedDepositTx } from "./deposits";

export type CreditOutcome = "credited" | "unknown_ref" | "already" | "error";

export async function creditPendingDeposit(trxRef: string): Promise<CreditOutcome> {
  let outcome: CreditOutcome = "error";
  try {
    await withTransaction(async (client: any) => {
      const r = await client.query("SELECT * FROM cashier_requests WHERE trx_ref = $1 FOR UPDATE", [trxRef]);
      const cr = r.rows[0];
      if (!cr) { outcome = "unknown_ref"; return; }
      if (cr.status !== "PENDING") { outcome = "already"; return; }
      const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [cr.user_id]);
      if (!locked.rows[0]) { outcome = "error"; return; }
      await applyApprovedDepositTx(client, {
        requestId: Number(cr.id),
        userId: Number(cr.user_id),
        amountCents: Number(cr.amount_cents),
        balanceBefore: Number(locked.rows[0].balance_cents),
      });
      outcome = "credited";
    });
  } catch (e) {
    console.error("[paywise] credit failed", trxRef, e);
    return "error";
  }
  return outcome;
}

/** Mark a PENDING deposit as REJECTED (payment failed / expired). */
export async function rejectPendingDeposit(trxRef: string): Promise<boolean> {
  const rows = await withTransaction(async (client: any) => {
    const r = await client.query(
      "UPDATE cashier_requests SET status='REJECTED' WHERE trx_ref = $1 AND status='PENDING' RETURNING id",
      [trxRef]
    );
    return r.rows.length > 0;
  }).catch(() => false);
  return Boolean(rows);
}

/**
 * Close out a withdrawal after the provider reports on the payout.
 *
 * `withdrawal.completed` → mark PAID. The balance was already debited when the
 * player requested it, so this must NOT touch the wallet.
 *
 * `withdrawal.failed` / `withdrawal.rejected` → give the money back and mark the
 * request REJECTED. This is the only way a player recovers funds from a payout
 * that never arrived, so it has to be idempotent: the status check under FOR UPDATE
 * means a repeated delivery can never refund twice.
 */
export type WithdrawalOutcome = "paid" | "refunded" | "already" | "unknown_ref" | "error";

export async function settleWithdrawal(withdrawalId: string, failed: boolean): Promise<WithdrawalOutcome> {
  let outcome: WithdrawalOutcome = "error";
  try {
    await withTransaction(async (client: any) => {
      const r = await client.query(
        "SELECT * FROM cashier_requests WHERE trx_ref = $1 AND request_type = 'WITHDRAW' FOR UPDATE",
        [withdrawalId]
      );
      const cr = r.rows[0];
      if (!cr) { outcome = "unknown_ref"; return; }

      if (failed) {
        // Refund unless we already refunded. A request that is still PENDING *or* was
        // optimistically marked PAID both need the money returned.
        if (cr.status === "REJECTED") { outcome = "already"; return; }
        const locked = await client.query("SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE", [cr.user_id]);
        if (!locked.rows[0]) { outcome = "error"; return; }
        const before = Number(locked.rows[0].balance_cents);
        const after = before + Number(cr.amount_cents);
        await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, cr.user_id]);
        await client.query(
          `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype, amount_cents, balance_before_cents, balance_after_cents)
           VALUES ($1,$2,'CASHIER','', 'WITHDRAW','withdraw_refund',$3,$4,$5)`,
          [`csh_wd_refund_${cr.id}`, cr.user_id, Number(cr.amount_cents), before, after]
        );
        await client.query("UPDATE cashier_requests SET status = 'REJECTED' WHERE id = $1", [cr.id]);
        outcome = "refunded";
        return;
      }

      if (cr.status === "PAID") { outcome = "already"; return; }
      await client.query("UPDATE cashier_requests SET status = 'PAID' WHERE id = $1", [cr.id]);
      outcome = "paid";
    });
  } catch (e) {
    console.error("[paywise] settleWithdrawal failed", withdrawalId, e);
    return "error";
  }
  return outcome;
}
