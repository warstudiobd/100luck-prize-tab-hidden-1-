/** Admin dashboard: provider leaderboard + catalogue breakdown.
 *
 *  One call powers the Games page "Top / Down" board and the category
 *  catalogue, so the panel never has to crunch the ledger client-side.
 *
 *    GET ?days=30&sort=stake|ggr|players|games|name
 *
 *  Per provider: games live, distinct players, total stake, total payout,
 *  GGR (stake − payout), and a rank per metric. "Top" is the provider winning
 *  most from players (highest GGR); "Down" is the weakest active one.
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Math.trunc(Number(searchParams.get("days") ?? 30)) || 30));
  const sort = String(searchParams.get("sort") ?? "ggr").toLowerCase();

  const providers = await query(
    `SELECT p.id, p.code, p.name, p.logo_url, p.is_active, p.default_category,
            COALESCE(g.games, 0)::int AS games,
            COALESCE(l.players, 0)::int AS players,
            COALESCE(l.stake, 0)::bigint AS stake_cents,
            COALESCE(l.payout, 0)::bigint AS payout_cents,
            COALESCE(l.rounds, 0)::int AS rounds
       FROM game_providers p
       LEFT JOIN (
         SELECT provider_id, COUNT(*)::int AS games
           FROM games_catalog WHERE is_active GROUP BY provider_id
       ) g ON g.provider_id = p.id
       LEFT JOIN (
         SELECT provider_code,
                COUNT(DISTINCT user_id) AS players,
                SUM(CASE WHEN action_type = 'DEBIT' THEN amount_cents ELSE 0 END) AS stake,
                SUM(CASE WHEN action_type = 'CREDIT' THEN amount_cents ELSE 0 END) AS payout,
                COUNT(*) AS rounds
           FROM wallet_ledger
          WHERE provider_code NOT IN ('CASHIER','BONUS','')
            AND created_at >= now() - ($1 || ' days')::interval
          GROUP BY provider_code
       ) l ON l.provider_code = p.code
      ORDER BY p.is_active DESC, p.name ASC`,
    [String(days)]
  );

  const rows = providers.map((r: any) => {
    const stake = Number(r.stake_cents);
    const payout = Number(r.payout_cents);
    return {
      id: Number(r.id),
      code: r.code,
      name: r.name,
      logo_url: r.logo_url ?? "",
      is_active: Boolean(r.is_active),
      default_category: r.default_category ?? "OTHER",
      games: Number(r.games),
      players: Number(r.players),
      rounds: Number(r.rounds),
      stake_cents: stake,
      payout_cents: payout,
      ggr_cents: stake - payout,
      margin_pct: stake > 0 ? Math.round(((stake - payout) / stake) * 10000) / 100 : 0,
    };
  });

  const rankBy = (key: string) => {
    const sorted = [...rows].sort((a: any, b: any) => Number(b[key]) - Number(a[key]));
    const map = new Map<string, number>();
    sorted.forEach((r, i) => map.set(r.code, i + 1));
    return map;
  };
  const ggrRank = rankBy("ggr_cents");
  const stakeRank = rankBy("stake_cents");
  const playerRank = rankBy("players");

  const ranked = rows.map((r: any) => ({
    ...r,
    rank_ggr: ggrRank.get(r.code) ?? null,
    rank_stake: stakeRank.get(r.code) ?? null,
    rank_players: playerRank.get(r.code) ?? null,
    revenue_share_cents: 0,
  }));
  const totalGgr = ranked.reduce((s, r) => s + Math.max(0, r.ggr_cents), 0);
  for (const r of ranked) r.revenue_share_cents = totalGgr > 0 ? Math.round((Math.max(0, r.ggr_cents) / totalGgr) * 100) : 0;

  const sortKey =
    sort === "stake" ? "stake_cents" :
    sort === "players" ? "players" :
    sort === "games" ? "games" :
    sort === "name" ? "name" : "ggr_cents";
  ranked.sort((a: any, b: any) =>
    sortKey === "name" ? String(a.name).localeCompare(String(b.name)) : Number(b[sortKey]) - Number(a[sortKey])
  );

  // "Top"/"Down" need real wagering, otherwise every provider with zero rounds
  // would tie at the bottom of the board.
  const playing = ranked
    .filter((r) => r.rounds > 0)
    .sort((a, b) => b.stake_cents - a.stake_cents);
  const top = playing[0] ?? null;
  const down = playing.length > 1 ? playing[playing.length - 1] : null;

  const categories = await query(
    `SELECT COALESCE(g.category, 'OTHER') AS category, COUNT(*)::int AS games,
            COUNT(DISTINCT g.provider_id)::int AS providers
       FROM games_catalog g
      WHERE g.is_active
      GROUP BY 1
      ORDER BY games DESC`
  );
  // Lead provider per category — one grouped pass, no correlated subquery.
  const topPerCategory = await query(
    `WITH counts AS (
       SELECT g.provider_id, g.category, COUNT(*)::int AS games
         FROM games_catalog g
         JOIN game_providers p ON p.id = g.provider_id AND p.is_active
        WHERE g.is_active
        GROUP BY g.provider_id, g.category
     ), best AS (
       SELECT DISTINCT ON (category) category, provider_id, games
         FROM counts
        ORDER BY category, games DESC
     )
     SELECT b.category, p.code, p.name, b.games
       FROM best b JOIN game_providers p ON p.id = b.provider_id
      ORDER BY b.category`
  );

  return corsJson({
    ok: true,
    days,
    sort,
    totals: {
      providers: ranked.length,
      active_providers: ranked.filter((r) => r.is_active).length,
      games: ranked.reduce((s, r) => s + r.games, 0),
      stake_cents: ranked.reduce((s, r) => s + r.stake_cents, 0),
      payout_cents: ranked.reduce((s, r) => s + r.payout_cents, 0),
      ggr_cents: ranked.reduce((s, r) => s + r.ggr_cents, 0),
      players: ranked.reduce((s, r) => s + r.players, 0),
    },
    top,
    down,
    providers: ranked,
    categories: categories.map((c: any) => ({ category: c.category, games: Number(c.games), providers: Number(c.providers) })),
    top_by_category: topPerCategory.map((c: any) => ({ category: c.category, code: c.code, name: c.name, games: Number(c.games) })),
  });
}
