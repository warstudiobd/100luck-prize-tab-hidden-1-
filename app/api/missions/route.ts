/**
 * মিশন — turnover missions, the 499bet "মিশন" screen.
 *
 *   GET  /api/missions
 *        missions[]  — every active mission with the player's REAL progress
 *        running / upcoming / finished — bucketed for the three tabs
 *        totals      — 26 targets, how many are done, how many still open
 *        ends_at     — next midnight Asia/Dhaka (the "অবশিষ্ট" countdown)
 *
 *   POST /api/missions  { id: "turnover_1000" }
 *        Pays the mission bonus as real BONUS balance, once, via creditBonusInTx.
 *
 * Progress is NEVER stored: it is the sum of the player's real DEBIT turnover
 * since the last Asia/Dhaka midnight, so it can never drift from the ledger.
 * Only the claim is persisted, with UNIQUE (user_id, mission_id) for idempotency.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";
import { assertHasDeposited } from "@/lib/reward-gate";

export const dynamic = "force-dynamic";

const DHAKA_DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')`;
const DHAKA_TOMORROW = `((date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') + interval '1 day') AT TIME ZONE 'Asia/Dhaka')`;

/** Qualifying turnover since midnight Asia/Dhaka — real bets only. */
async function turnoverToday(userId: number): Promise<number> {
  const r = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents
       FROM wallet_ledger
      WHERE user_id = $1 AND action_type = 'DEBIT'
        AND provider_code NOT IN ('CASHIER', 'BONUS', '')
        AND created_at >= ${DHAKA_DAY_START}`,
    [userId]
  ).catch(() => [] as any[]);
  return Number((r as any[])[0]?.cents ?? 0);
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  const [rows, claims, done] = await Promise.all([
    query("SELECT id, title_bn, title_en, target_cents, bonus_cents, sort_order FROM missions WHERE is_active ORDER BY sort_order").catch(() => [] as any[]),
    query("SELECT mission_id, bonus_cents, claimed_at FROM mission_claims WHERE user_id = $1", [userId]).catch(() => [] as any[]),
    turnoverToday(userId),
  ]);

  const claimedMap = new Map((claims as any[]).map(r => [String(r.mission_id), r]));
  const list = (rows as any[]).map(r => {
    const target = Number(r.target_cents);
    const claim = claimedMap.get(String(r.id));
    const reached = done >= target;
    return {
      id: String(r.id),
      title_bn: String(r.title_bn),
      title_en: String(r.title_en),
      target_cents: target,
      bonus_cents: Number(r.bonus_cents),
      progress_cents: Math.min(done, target),
      pct: target > 0 ? Math.min(100, (done / target) * 100) : 100,
      reached,
      claimed: Boolean(claim),
      claimable: reached && !claim,
      claimed_at: claim?.claimed_at ?? null,
    };
  });

  const nextEnd = await query(`SELECT ${DHAKA_TOMORROW} AS end`).catch(() => [] as any[]);

  return NextResponse.json({
    ok: true,
    turnover_cents: done,
    ends_at: (nextEnd as any[])[0]?.end ?? null,
    totals: {
      all: list.length,
      reached: list.filter(m => m.reached).length,
      claimed: list.filter(m => m.claimed).length,
      claimable: list.filter(m => m.claimable).length,
      bonus_on_table_cents: list.filter(m => m.claimable).reduce((s, m) => s + m.bonus_cents, 0),
    },
    missions: list,
  });
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const userId = Number(sess.sub);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "mission_required" }, { status: 400 });

  // No deposit, no bonus: a registration that never paid in cannot harvest
  // mission rewards as withdrawable balance.
  const gate = await assertHasDeposited(userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, code: gate.code, error: gate.error, error_bn: gate.error_bn, gate: gate.gate }, { status: 403 });
  }

  const mRows = await query(
    "SELECT id, target_cents, bonus_cents FROM missions WHERE id = $1 AND is_active",
    [id]
  ).catch(() => [] as any[]);
  const mission = (mRows as any[])[0];
  if (!mission) return NextResponse.json({ ok: false, error: "unknown_mission" }, { status: 404 });

  const done = await turnoverToday(userId);
  if (done < Number(mission.target_cents)) {
    return NextResponse.json({ ok: false, error: "target_not_reached" }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO mission_claims (user_id, mission_id, bonus_cents)
         VALUES ($1, $2, $3) ON CONFLICT (user_id, mission_id) DO NOTHING RETURNING id`,
        [userId, id, Number(mission.bonus_cents)]
      );
      if (ins.rowCount === 0) return { already: true };

      await creditBonusInTx(client, {
        userId,
        deltaCents: Number(mission.bonus_cents),
        subtype: "mission",
        callId: `bns_mission_${userId}_${id}_${new Date().toISOString().slice(0, 10)}`,
      });
      const bal = await client.query("SELECT balance_cents FROM users WHERE id = $1", [userId]);
      return { already: false, balance_cents: Number((bal.rows[0] as any)?.balance_cents ?? 0) };
    });

    if (result.already) {
      return NextResponse.json({ ok: true, claimed: false, paid_cents: 0, reason: "already_claimed" });
    }
    return NextResponse.json({
      ok: true, claimed: true, paid_cents: Number(mission.bonus_cents),
      balance_cents: (result as any).balance_cents,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "claim_failed" }, { status: 500 });
  }
}
