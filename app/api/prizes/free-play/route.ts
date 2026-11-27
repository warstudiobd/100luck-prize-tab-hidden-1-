/** Free, deposit-earned plays for each prize game. No stake or fee; rewards are capped at ৳6. */
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { creditBonusInTx } from "@/lib/bonus";

export const dynamic = "force-dynamic";
const GAMES = ["egg", "envelope", "mail"] as const;
type Game = typeof GAMES[number];
const MAX_PRIZE_CENTS = 600;

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rows = await query(
    `SELECT game_key, COUNT(*)::int AS available
       FROM prize_game_credits
      WHERE user_id = $1 AND redeemed_at IS NULL
      GROUP BY game_key`, [Number(sess.sub)]
  );
  const available = Object.fromEntries(GAMES.map(g => [g, 0])) as Record<Game, number>;
  for (const row of rows as any[]) available[row.game_key as Game] = Number(row.available);
  return NextResponse.json({ ok: true, available, max_prize_cents: MAX_PRIZE_CENTS, fee_cents: 0 });
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "Log in to play", error_bn: "খেলতে লগইন করুন" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const game = String(body.game ?? "") as Game;
  if (!GAMES.includes(game)) return NextResponse.json({ ok: false, error: "Unknown game" }, { status: 400 });
  const userId = Number(sess.sub);

  try {
    const out = await withTransaction(async client => {
      const user = await client.query("SELECT is_blocked FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user.rows[0]) return { status: 404 as const, error: "user not found" };
      if (user.rows[0].is_blocked) return { status: 403 as const, error: "account is blocked" };
      const credit = await client.query(
        `SELECT id FROM prize_game_credits
          WHERE user_id = $1 AND game_key = $2 AND redeemed_at IS NULL
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`, [userId, game]
      );
      if (!credit.rows[0]) return { status: 403 as const, code: "no_free_play", error: "A successful deposit of ৳500 or more gives one free play in each game.", error_bn: "৳৫০০ বা তার বেশি সফল ডিপোজিটে প্রতিটি গেমে একটি ফ্রি প্লে পাবেন।" };

      // Secure server-side reward. All four games share this hard ৳6 ceiling.
      const prizeCents = randomInt(1, MAX_PRIZE_CENTS + 1);
      const updated = await client.query(
        `UPDATE prize_game_credits SET prize_cents = $1, redeemed_at = now()
          WHERE id = $2 AND redeemed_at IS NULL RETURNING id`, [prizeCents, credit.rows[0].id]
      );
      if (!updated.rows[0]) return { status: 409 as const, error: "play already used" };
      const creditId = Number(updated.rows[0].id);
      const balance = await creditBonusInTx(client, {
        userId, deltaCents: prizeCents, callId: `bns_game_${creditId}`, subtype: `prize_${game}`,
      });

      const remaining = await client.query(
        `SELECT COUNT(*)::int AS n FROM prize_game_credits
          WHERE user_id = $1 AND game_key = $2 AND redeemed_at IS NULL`, [userId, game]
      );
      return { status: 200 as const, game, prize_cents: prizeCents, fee_cents: 0,
        balance_cents: balance, plays_available: Number(remaining.rows[0]?.n ?? 0) };
    });
    if (out.status !== 200) return NextResponse.json({ ok: false, ...out }, { status: out.status });
    return NextResponse.json({ ok: true, ...out });
  } catch (error) {
    console.error("[prizes/free-play] failed", error);
    return NextResponse.json({ ok: false, error: "play failed" }, { status: 500 });
  }
}
