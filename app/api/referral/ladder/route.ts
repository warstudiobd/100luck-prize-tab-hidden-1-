/**
 * POST /api/referral/ladder — pay every referral tier the player has unlocked.
 *
 * A tier becomes claimable when the player's own valid referral count reaches the
 * tier's `referrals`. Each tier pays once (`invite_ladder_claims` UNIQUE), and the
 * credits go through creditBonusInTx, so they land in the ledger like any bonus.
 *
 * Tiers are never paid for referrals that do not exist: the count comes from
 * users.referred_by, exactly the number the screen displays.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";
import { assertHasDeposited } from "@/lib/reward-gate";

export const dynamic = "force-dynamic";

export async function POST() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  // No deposit, no bonus — otherwise the invite ladder is a free-money loop for
  // accounts that are only ever registered and never funded.
  const gate = await assertHasDeposited(userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, code: gate.code, error: gate.error, error_bn: gate.error_bn, gate: gate.gate }, { status: 403 });
  }

  const out = await withTransaction(async (client) => {
    const locked = await client.query("SELECT balance_cents, is_blocked FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!locked.rows[0]) return { status: 404 as const, error: "user not found" };
    if (locked.rows[0].is_blocked) return { status: 403 as const, error: "account is blocked" };

    const countRow = await client.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE referred_by = $1 AND id <> $1",
      [userId]
    );
    const referrals = Number(countRow.rows[0]?.n ?? 0);

    const due = await client.query(
      `SELECT l.referrals, l.bonus_cents
         FROM invite_ladder l
        WHERE l.referrals <= $1
          AND NOT EXISTS (SELECT 1 FROM invite_ladder_claims c WHERE c.user_id = $2 AND c.referrals = l.referrals)
        ORDER BY l.referrals ASC`,
      [referrals, userId]
    );

    let paidCents = 0;
    let tiers = 0;
    let balance = Number(locked.rows[0].balance_cents);

    for (const row of due.rows) {
      const claim = await client.query(
        `INSERT INTO invite_ladder_claims (user_id, referrals, bonus_cents)
         VALUES ($1,$2,$3) ON CONFLICT (user_id, referrals) DO NOTHING RETURNING id`,
        [userId, Number(row.referrals), Number(row.bonus_cents)]
      );
      if (!claim.rows[0]) continue;
      balance = await creditBonusInTx(client, {
        userId,
        deltaCents: Number(row.bonus_cents),
        callId: `bns_ladder_${userId}_${row.referrals}`,
        subtype: "referral_bonus",
      });
      paidCents += Number(row.bonus_cents);
      tiers += 1;
    }

    return { status: 200 as const, referrals, tiers_paid: tiers, paid_cents: paidCents, balance_cents: balance };
  });

  if (out.status !== 200) return NextResponse.json({ ok: false, ...out }, { status: out.status });
  return NextResponse.json({ ok: true, ...out });
}
