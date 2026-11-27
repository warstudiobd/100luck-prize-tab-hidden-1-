/** "Sync from SoftAggregator" — demo mode re-seeds the local catalog; live mode pulls getGameList and upserts. */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { softaggregator, isDemoMode, responseOf } from "@/lib/softaggregator";
import { GAME_CATEGORIES, type GameCategory } from "@/lib/types";
import { corsJson, corsPreflight, resolveAdmin } from "@/lib/admin-http";
export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

const DEMO_SYNC = [
  ["JILI","jili_super_ace","Super Ace","সুপার এস","SLOTS",1],["JILI","jili_fortune_gems","Fortune Gems","ফরচুন জেমস","SLOTS",2],
  ["JILI","jili_money_coming","Money Coming","মানি কামিং","SLOTS",3],["JILI","jili_boxing_king","Boxing King","বক্সিং কিং","SLOTS",4],
  ["JILI","jili_super_elements","Super Elements","সুপার এলিমেন্টস","SLOTS",5],["JILI","jili_super_elements_2","Super Elements 2","সুপার এলিমেন্টস ২","SLOTS",6],
  ["FA_CHAI","fa_chai_chinese_new_year","Chinese New Year","চাইনিজ নিউ ইয়ার","SLOTS",7],["FA_CHAI","fa_chai_golden_panther","Golden Panther","গোল্ডেন প্যান্থার","SLOTS",8],
  ["SPRIBE","spribe_aviator","Aviator","এভিয়েটর","CRASH",9],
] as const;

const CATEGORY_SET = new Set<string>(GAME_CATEGORIES);
const TYPE_MAP: Record<string, GameCategory> = {
  slots: "SLOTS", live: "LIVE", crash: "CRASH", table: "TABLE", instant: "INSTANT",
  fishing: "FISHING", bingo: "BINGO", keno: "KENO", virtual: "VIRTUAL",
  sportsbook: "SPORTSBOOK", sports: "SPORTS", poker: "POKER", other: "OTHER",
};

function catFromGameType(v: any): GameCategory {
  const raw = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return "OTHER";
  if (TYPE_MAP[raw]) return TYPE_MAP[raw];
  const compact = raw.replace(/_/g, "");
  for (const [k, mapped] of Object.entries(TYPE_MAP)) if (k.replace(/_/g, "") === compact) return mapped;
  const upper = raw.toUpperCase();
  return CATEGORY_SET.has(upper) ? (upper as GameCategory) : "OTHER";
}

const str = (v: any, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req: NextRequest) {
  // Demo mode is open to any logged-in user (pure local upsert). Live provider calls are admin-only
  // and also accept the admin-panel Bearer token (CORS-enabled for the separate admin app).
  if (!isDemoMode()) {
    const admin = await resolveAdmin(req);
    if (!admin) return corsJson({ ok: false, error: "admin only in live mode" }, 403);
  } else {
    const sess = await getSessionUserId();
    if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const list = await softaggregator.getGameList();
  if (!list.ok) return corsJson({ ok: false, error: list.error ?? "provider getGameList failed" }, 502);

  const response = responseOf(list.data);
  const remote: any[] = Array.isArray(response) ? response : (response?.list ?? response?.games ?? response?.items ?? []);
  let synced = 0;
  let skipped = 0;
  const categoriesSeen = new Set<string>();

  await withTransaction(async (client) => {
    if (isDemoMode()) {
      for (const [provider, code, title, titleBn, cat, order] of DEMO_SYNC) {
        await client.query(
          `INSERT INTO games_catalog (provider_code, game_code, title, title_bn, category, thumbnail_url, is_hot, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7)
           ON CONFLICT (game_code) DO UPDATE SET provider_code=EXCLUDED.provider_code, title=EXCLUDED.title, title_bn=EXCLUDED.title_bn, category=EXCLUDED.category, thumbnail_url=EXCLUDED.thumbnail_url, sort_order=EXCLUDED.sort_order`,
          [provider, code, title, titleBn, cat, `/thumbs/${code}.svg`, order]
        );
        synced++; categoriesSeen.add(cat);
      }
      return;
    }
    for (const g of remote) {
      // SoftAggregator: id_hash is the byte-for-byte gameid used by getGameList callbacks/launches.
      const code = str(g?.id_hash ?? g?.game_id ?? g?.game_code ?? g?.code, 64);
      if (!code) { skipped++; continue; }
      const provider = str(g?.provider ?? g?.provider_code ?? "UNKNOWN", 32).toUpperCase();
      const title = str(g?.name ?? g?.title ?? code, 128) || code;
      const cat = catFromGameType(g?.game_type ?? g?.type ?? g?.category);
      const thumb = str(g?.image_square ?? g?.image ?? g?.image_portrait ?? g?.image_long ?? `/thumbs/${code}.svg`, 2048);
      const featured = !!(g?.featured ?? g?.new);
      const jackpot = !!g?.has_jackpot;
      const sort = featured ? 10 : jackpot ? 20 : String(g?.range ?? "").startsWith("r1") ? 30 : 100;
      await client.query(
        `INSERT INTO games_catalog (provider_code, game_code, title, title_bn, category, thumbnail_url, is_hot, sort_order)
         VALUES ($1,$2,$3,'',$4,$5,$6,$7)
         ON CONFLICT (game_code) DO UPDATE SET
           provider_code=EXCLUDED.provider_code, title=EXCLUDED.title, category=EXCLUDED.category,
           thumbnail_url=EXCLUDED.thumbnail_url, is_hot=EXCLUDED.is_hot, sort_order=EXCLUDED.sort_order`,
        [provider, code, title, cat, thumb, featured || jackpot, sort]
      );
      synced++; categoriesSeen.add(cat);
    }
  });

  return corsJson({ ok: true, demo: isDemoMode(), synced, skipped, categories: Array.from(categoriesSeen).sort(), total_seen: remote.length, message: isDemoMode() ? "Demo catalog re-synced locally" : `Upserted ${synced} games from SoftAggregator` });
}
