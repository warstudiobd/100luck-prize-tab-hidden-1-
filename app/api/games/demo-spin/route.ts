/**
 * Free-trial spin engine.
 *
 * IMPORTANT: this never touches users.balance_cents, the ledger or the referral
 * wager counter. A trial must be free practice money, so the balance is a virtual
 * "trial credit" carried by the client (see app/play/demo/page.tsx) and the server
 * only decides the outcome. That also makes it instant: no wallet transaction, no
 * database round-trip, no provider call.
 *
 * If a signed-in player asks, we still report their real wallet balance so the
 * trial screen can show "your real balance is ৳X — this is a practice game".
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "👑", "7️⃣"];
// RTP ≈ 91%
const OUTCOMES: Array<{ p: number; mult: number; subtype: string }> = [
  { p: 0.60, mult: 0,   subtype: "no_win" },
  { p: 0.25, mult: 1.2, subtype: "win"    },
  { p: 0.08, mult: 2,   subtype: "win"    },
  { p: 0.05, mult: 5,   subtype: "big_win" },
  { p: 0.02, mult: 10,  subtype: "jackpot" },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gameCode = String(body.game_code ?? "demo_slot").slice(0, 64);

  // The client sends the trial balance it is playing with; we never debit a wallet.
  const trialBalance = Math.trunc(Number(body.trial_balance_cents));
  const bet = Math.trunc(Number(body.bet_cents));
  if (!Number.isFinite(bet) || bet < 100 || bet > 1_000_000) {
    return NextResponse.json({ ok: false, error: "bet_cents must be between 100 and 1,000,000 (৳1 – ৳10,000)" }, { status: 400 });
  }
  if (!Number.isFinite(trialBalance) || trialBalance < bet) {
    return NextResponse.json({ ok: false, error: "trial_balance_exhausted", code: "TRIAL_EMPTY" }, { status: 400 });
  }

  const roll = Math.random();
  let acc = 0, outcome = OUTCOMES[0];
  for (const o of OUTCOMES) { acc += o.p; if (roll <= acc) { outcome = o; break; } }

  const winCents = Math.round(bet * outcome.mult);
  const reels = outcome.mult === 0
    ? [SYMBOLS[Math.floor(Math.random() * 7)], SYMBOLS[Math.floor(Math.random() * 7)], SYMBOLS[Math.floor(Math.random() * 7)]]
    : [SYMBOLS[4], SYMBOLS[4], outcome.mult >= 5 ? SYMBOLS[6] : SYMBOLS[4]]; // three of a kind on wins

  // Real wallet balance is read-only context for the banner, never modified.
  let realBalanceCents: number | null = null;
  const sess = await getSessionUserId();
  if (sess) {
    const r = await query("SELECT balance_cents FROM users WHERE id = $1", [sess.sub]).catch(() => []);
    if (r[0]) realBalanceCents = Number(r[0].balance_cents);
  }

  return NextResponse.json({
    ok: true,
    reels,
    win_cents: winCents,
    multiplier: outcome.mult,
    subtype: outcome.subtype,
    /** trial credits left after this spin: stake leaves, win comes back */
    trial_balance_cents: trialBalance - bet + winCents,
    real_balance_cents: realBalanceCents,
    wallet_touched: false,
    game_code: gameCode,
  });
}
