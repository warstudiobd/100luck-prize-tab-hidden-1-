import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { GAME_CATEGORIES } from "@/lib/types";
export const dynamic = "force-dynamic";

/**
 * Pre-generated thumbnails.
 *
 * scripts/gen-game-thumbs.js writes public/thumbs/games/<game_code>.webp for every
 * reachable tile. The CDN originals are ~700 KB full-size cover art that the image
 * optimiser had to download and re-encode (964 ms of server CPU per cold tile), so
 * serving the small static WebP first is the single biggest win on this screen.
 *
 * Anything without a generated file falls back to the CDN URL, so a partially run
 * job is always safe.
 */
const LOCAL_THUMBS = new Set(
  (() => {
    try {
      return require("fs")
        .readdirSync(`${process.cwd()}/public/thumbs/games`)
        .filter((f: string) => f.endsWith(".webp"))
        .map((f: string) => f.slice(0, -5));
    } catch {
      return [];
    }
  })()
);

function withThumb<T extends { game_code?: string; thumbnail_url?: string }>(g: T): T {
  const code = String(g.game_code ?? "");
  if (code && LOCAL_THUMBS.has(code)) return { ...g, thumbnail_url: `/thumbs/games/${code}.webp` };
  return g;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const provider = searchParams.get("provider");
  const q = searchParams.get("q")?.trim();

  // Favourites are kept in localStorage by game_code and can belong to any
  // category, so they need one lookup by code rather than a category scan.
  const codes = searchParams.get("codes");
  if (codes) {
    const list = codes.split(",").map(c => c.trim()).filter(Boolean).slice(0, 40);
    if (list.length === 0) return NextResponse.json({ ok: true, games: [] });
    const rows = await query(
      `SELECT id, provider_code, game_code, title, title_bn, category, thumbnail_url,
              is_favorite_default, is_hot
         FROM games_catalog WHERE is_active = TRUE AND game_code = ANY($1::text[])`,
      [list]
    );
    const byCode = new Map((rows as any[]).map(r => [String(r.game_code), r]));
    const ordered = list.map(c => byCode.get(c)).filter(Boolean)
      .map(g => withThumb({ ...g, id: Number(g.id) }));
    const res = NextResponse.json({ ok: true, games: ordered });
    res.headers.set("Cache-Control", "private, max-age=30");
    return res;
  }

  const where: string[] = [];
  const params: any[] = [];
  const valid = new Set<string>(GAME_CATEGORIES);
  const hotOnly = searchParams.get("hot") === "1";
  where.push("is_active = TRUE");
  // ?hot=1 answers the homepage question "what is everyone playing" on its own,
  // so the client no longer has to download 300 mixed games to find the hot ones.
  if (hotOnly) where.push("is_hot = TRUE");
  if (category && valid.has(category.toUpperCase())) { params.push(category.toUpperCase()); where.push(`category = $${params.length}`); }
  if (provider && provider !== "ALL") { params.push(provider.toUpperCase()); where.push(`provider_code = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR title_bn ILIKE $${params.length})`); }

  // Only the columns the lobby grid actually renders. SELECT * shipping every
  // catalog column (provider ids, flags, timestamps) bloated this payload and
  // slowed the first paint — keep it lean.
  const rows = await query(
    `SELECT id, provider_code, game_code, title, title_bn, category, thumbnail_url,
            is_favorite_default, is_hot
     FROM games_catalog ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY is_hot DESC, sort_order ASC, id ASC LIMIT 300`,
    params
  );
  // The lobby renders before thumbnails are fetched, so let the browser and the
  // CDN cache the list too (only the favourites flags are personalised, and those
  // are seeded once into localStorage client-side).
  // A light count per category so the rail can show how much sits behind each
  // tab without shipping the games themselves.
  const counts = await query(
    `SELECT category, COUNT(*)::int AS n FROM games_catalog WHERE is_active = TRUE GROUP BY category`
  ).catch(() => [] as any[]);
  const hotCount = await query(
    `SELECT COUNT(*)::int AS n FROM games_catalog WHERE is_active = TRUE AND is_hot = TRUE`
  ).catch(() => [{ n: 0 }]);

  const res = NextResponse.json({
    ok: true,
    games: rows.map(g => withThumb({ ...g, id: Number(g.id) })),
    counts: Object.fromEntries((counts as any[]).map(r => [r.category, Number(r.n)])),
    hot_count: Number((hotCount as any[])[0]?.n ?? 0),
  });
  // s-maxage lets Vercel's CDN answer repeat requests without waking a function, and
  // stale-while-revalidate keeps the lobby instant while the list refreshes behind
  // the user. The payload is identical for everyone, so it can be cached publicly.
  res.headers.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=1800, stale-while-revalidate=86400"
  );
  return res;
}
