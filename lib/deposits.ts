/**
 * Shared internals for approving a deposit — used by BOTH the manual admin
 * decision endpoint (/api/cashier/decision) and the automated gateway callback
 * (/api/deposit/gateway/callback). Must run inside a transaction whose
 * cashier_requests row is already locked FOR UPDATE and verified PENDING.
 * Idempotent: ledger call_id csh_dep_appr_<id> is UNIQUE.
 */
export interface ApprovedDepositResult {
  balance_cents: number;
  referral: { paid: boolean; referrerId?: number; amountCents?: number };
}

export async function applyApprovedDepositTx(
  client: any,
  args: { requestId: number; userId: number; amountCents: number; balanceBefore: number }
): Promise<ApprovedDepositResult> {
  const { requestId, userId, amountCents, balanceBefore } = args;
  const after = balanceBefore + amountCents;

  await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, userId]);
  await client.query(
    `INSERT INTO wallet_ledger (call_id, user_id, provider_code, game_code, action_type, tx_subtype,
                                amount_cents, balance_before_cents, balance_after_cents)
     VALUES ($1,$2,'CASHIER','','DEPOSIT','deposit_approved',$3,$4,$5)
     ON CONFLICT (call_id) DO NOTHING`,
    [`csh_dep_appr_${requestId}`, userId, amountCents, balanceBefore, after]
  );
  await client.query("UPDATE cashier_requests SET status = 'APPROVED' WHERE id = $1", [requestId]);

  // One free, no-wager play in each of the four prize games per newly approved
  // deposit of at least ৳500. Entitlements are created in the same transaction
  // as the deposit credit, so failed/retried approvals cannot duplicate them.
  // Historical deposits are intentionally not backfilled.
  if (amountCents >= 50_000) {
    await client.query(
      `INSERT INTO prize_game_credits (user_id, deposit_request_id, game_key)
       SELECT $1, $2, game_key
         FROM unnest(ARRAY['egg','envelope','mail']::text[]) AS games(game_key)
       ON CONFLICT (deposit_request_id, game_key) DO NOTHING`,
      [userId, requestId]
    );
    // Maintain the legacy wheel entitlement table for existing readers during migration.
    await client.query(
      `INSERT INTO lucky_wheel_credits (user_id, deposit_request_id, deposit_amount_cents)
       VALUES ($1, $2, $3) ON CONFLICT (deposit_request_id) DO NOTHING`,
      [userId, requestId, amountCents]
    );
  }

  // Referral qualification check (hidden rule: ৳500 deposited + ৳3,000 wagered).
  // Dynamic import avoids any import cycle bonus.ts ⇄ wallet.ts.
  const { maybePayReferralBonus } = await import("./bonus");
  const referral = await maybePayReferralBonus(client, userId, requestId, "deposit");

  return { balance_cents: after, referral };
}
