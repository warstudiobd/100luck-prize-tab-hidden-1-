/** POST /api/prizes/spin — redeem one free spin earned by an approved ৳500+ deposit.
 * Every spin awards exactly ৳6. No stake, play fee, wager, random prize, or physical prize.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";

export const dynamic = "force-dynamic";
const DAY_SQL = "(now() AT TIME ZONE 'Asia/Dhaka')::date";
const FIXED_PRIZE_CENTS = 600;

export async function POST() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "Log in to spin", error_bn: "স্পিন করতে লগইন করুন" }, { status: 401 });
  const userId = Number(sess.sub);

  try {
    const out = await withTransaction(async (client) => {
      const u = await client.query("SELECT is_blocked FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!u.rows[0]) return { status: 404 as const, error: "user not found" };
      if (u.rows[0].is_blocked) return { status: 403 as const, error: "account is blocked" };

      const [credit] = (await client.query(
        `SELECT id, deposit_request_id FROM lucky_wheel_credits
          WHERE user_id = $1 AND spin_id IS NULL
          ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [userId]
      )).rows;
      if (!credit) {
        return { status: 403 as const, code: "no_free_spin", error: "A successful deposit of ৳500 or more gives one free spin.", error_bn: "৳৫০০ বা তার বেশি সফল ডিপোজিটে একটি ফ্রি স্পিন পাবেন।" };
      }

      const spin = await client.query(
        `INSERT INTO lucky_spins (user_id, spin_day, prize_key, prize_cents, fee_cents)
         VALUES ($1, ${DAY_SQL}, 'p6', $2, 0) RETURNING id`,
        [userId, FIXED_PRIZE_CENTS]
      );
      const spinId = Number(spin.rows[0].id);
      const balance = await creditBonusInTx(client, {
        userId, deltaCents: FIXED_PRIZE_CENTS,
        callId: `bns_wheel_${spinId}`, subtype: "prize_wheel", provider: "BONUS",
      });
      await client.query(
        `UPDATE lucky_wheel_credits SET spin_id = $1, redeemed_at = now() WHERE id = $2 AND spin_id IS NULL`,
        [spinId, credit.id]
      );
      const wheel = await client.query(
        `INSERT INTO prize_wheel (user_id, prize_key, prize_cents, fee_cents, physical, wheel_day)
         VALUES ($1, 'p6', $2, 0, false, ${DAY_SQL}) RETURNING id`,
        [userId, FIXED_PRIZE_CENTS]
      );
      return { status: 200 as const, prize_key: "p6", prize_cents: FIXED_PRIZE_CENTS,
        label_en: "৳6", label_bn: "৳৬", physical: false, spin_id: spinId,
        wheel_id: Number(wheel.rows[0].id), fee_cents: 0, balance_cents: balance };
    });
    if (out.status !== 200) return NextResponse.json({ ok: false, ...out }, { status: out.status });
    const { status: _status, ...body } = out;
    return NextResponse.json({ ok: true, ...body });
  } catch (e) {
    console.error("[prizes/spin] failed", e);
    return NextResponse.json({ ok: false, error: "spin failed" }, { status: 500 });
  }
}
