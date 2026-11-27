"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import GameCard from "./GameCard";
import { Cherry, Radio, Fish, Spade, Trophy, Flame, Heart, Star, Rocket, LayoutGrid, Zap, Hash, Circle, Monitor, Gamepad2, Search, X } from "lucide-react";
import { useLang } from "../lang";
import { GAME_CATEGORIES, type GameRow, type GameCategory } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

const CATEGORY_META: Record<GameCategory, { key_i18n: MsgKey; icon: any }> = {
  SLOTS:      { key_i18n: "slots",      icon: Cherry },
  LIVE:       { key_i18n: "live",       icon: Radio },
  CRASH:      { key_i18n: "crash",      icon: Rocket },
  TABLE:      { key_i18n: "table",      icon: LayoutGrid },
  INSTANT:    { key_i18n: "instant",    icon: Zap },
  FISHING:    { key_i18n: "fishing",    icon: Fish },
  BINGO:      { key_i18n: "bingo",      icon: Circle },
  KENO:       { key_i18n: "keno",       icon: Hash },
  VIRTUAL:    { key_i18n: "virtual",    icon: Monitor },
  SPORTSBOOK: { key_i18n: "sportsbook", icon: Trophy },
  POKER:      { key_i18n: "poker",      icon: Spade },
  SPORTS:     { key_i18n: "sports",     icon: Trophy },
  OTHER:      { key_i18n: "other",      icon: Gamepad2 },
};
const CATEGORIES = GAME_CATEGORIES.map(id => ({ id, ...CATEGORY_META[id] }));

/** Long provider codes (PRAGMATICPLAY…) overflow a 100px card — shorten them. */
const PROVIDER_SHORT: Record<string, string> = {
  PRAGMATICPLAY: "PP", PRAGMATIC: "PP", FA_CHAI: "FA CHAI", JOKER123: "JOKER",
  PLAYSTAR: "PLAYSTAR", NETENT: "NETENT", SPRIBE: "SPRIBE", PGSOFT: "PG",
  EVOLUTION: "EVO", EVOPLAY: "EVO", REDTIGER: "REDTIGER", HABANERO: "HABA",
  CQ9: "CQ9", MGD: "MGD", ASKM: "ASKM", FUNKYGAMES: "FUNKY", JDB: "JDB",
};
function providerLabel(code: string) {
  const mapped = PROVIDER_SHORT[code];
  if (mapped) return mapped;
  return code.replace(/_/g, "").slice(0, 9);
}

function providerBadge(code: string) {
  switch (code) {
    case "JILI":    return "bg-[#F5B800] text-[#1a1300]";
    case "FA_CHAI": return "bg-[#e2136e] text-white";
    case "SPRIBE":  return "bg-[#7c3aed] text-white";
    default:        return "bg-white/85 text-black";
  }
}

/** A grid row of tiles. Defined at module scope on purpose: a component declared
 *  inside GameLobby gets a new identity on every render, which makes React unmount
 *  and remount every tile — re-downloading every thumbnail. That was the "games
 *  interfere and lag" symptom. */
function Tile({ g, eager, fav, lang, onLaunch, onToggleFav }: {
  g: GameRow; eager?: boolean; fav: boolean; lang: string;
  onLaunch: (game: { game_code: string; title: string; title_bn?: string | null; provider_code: string; thumbnail_url?: string | null; category?: string | null }) => void;
  onToggleFav: (gameCode: string) => void;
}) {
  return (
    <GameCard
      g={g}
      eager={eager}
      fav={fav}
      label={lang === "bn" && g.title_bn ? g.title_bn : g.title}
      providerLabel={providerLabel(g.provider_code)}
      providerBadge={providerBadge(g.provider_code)}
      onLaunch={onLaunch}
      onToggleFav={onToggleFav}
    />
  );
}

function Section({ title, items, icon, limit, favList, lang, onLaunch, onToggleFav }: {
  title: string; items: GameRow[]; icon?: React.ReactNode; limit?: number;
  favList: string[]; lang: string;
  onLaunch: (game: { game_code: string; title: string; title_bn?: string | null; provider_code: string; thumbnail_url?: string | null; category?: string | null }) => void;
  onToggleFav: (gameCode: string) => void;
}) {
  if (items.length === 0) return null;
  const list = limit ? items.slice(0, limit) : items;
  return (
    <section className="mb-2">
      <div className="flex items-center justify-between px-1 mb-1 mt-1.5">
        <h3 className="flex items-center gap-1 text-[10px] font-black tracking-[.12em] text-[#F5B800] uppercase">{icon}{title}</h3>
        <span className="rounded-full border border-white/10 bg-white/5 px-1.5 text-[7.5px] font-bold text-white/45 tabular-nums">{items.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-[5px] lg:grid-cols-6 lg:gap-2.5">
        {list.map((g, i) => (
          <Tile key={g.game_code} g={g} eager={i < 3} fav={favList.includes(g.game_code)} lang={lang} onLaunch={onLaunch} onToggleFav={onToggleFav} />
        ))}
      </div>
    </section>
  );
}

export default function GameLobby({ onLaunch }: {
  onLaunch: (game: { game_code: string; title: string; title_bn?: string | null; provider_code: string; thumbnail_url?: string | null; category?: string | null }) => void;
}) {
  const { t, lang } = useLang();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);      // first paint only
  const [busy, setBusy] = useState(false);           // a switch is in flight
  // "HOT" is a real tab, not a filter: it asks the server for the hot list, so
  // every tile in it is genuinely hot. Before, the page downloaded 300 mixed
  // games and filtered them client-side, which meant tapping Slots showed only
  // the handful of slots that happened to be in that batch.
  const [mode, setMode] = useState<"HOT" | GameCategory>("HOT");
  const category: GameCategory = mode === "HOT" ? "SLOTS" : mode;
  const [provider, setProvider] = useState<string>("ALL");
  const [favs, setFavs] = useState<string[] | null>(null); // null = not initialised yet
  const [favGames, setFavGames] = useState<GameRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hotCount, setHotCount] = useState(0);
  const PAGE_SIZE = 18;         // 6 rows of 3 on a phone — the rest loads on demand
  const PAGE_SIZE_WIDE = 36;    // 6 columns on desktop
  const [shown, setShown] = useState(PAGE_SIZE);
  /* desktop shows 6 columns — give it two pages' worth in one go */
  useEffect(() => {
    const wide = () => window.matchMedia("(min-width: 1024px)").matches;
    if (wide()) setShown(PAGE_SIZE_WIDE);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setShown(e.matches ? PAGE_SIZE_WIDE : PAGE_SIZE);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  useEffect(() => {
    setShown(window.matchMedia("(min-width: 1024px)").matches ? PAGE_SIZE_WIDE : PAGE_SIZE);
  }, [mode, provider, query]);
  const favList = favs ?? [];

  // ── load the games for whatever is selected ────────────────────────────────
  // One request per view (hot / category / search), cached by the CDN, aborted the
  // moment the player taps another tab so a slow reply can never overwrite a newer
  // one. The previous grid stays on screen while switching, so the page never
  // collapses into a skeleton again.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const qs = new URLSearchParams();
        if (query) qs.set("q", query);
        else if (mode === "HOT") qs.set("hot", "1");
        else qs.set("category", mode);
        // cache:"force-cache" reuses the warm copy the server prefetched for this exact
        // URL during render (see lib/games.ts), instead of starting a second request
        // after hydration. Cold visitors still get one request, as before.
        const r = await fetch(`/api/games?${qs.toString()}`, {
          signal: ctrl.signal,
          cache: "force-cache",
        }).then(r => r.json());
        if (r?.ok) {
          setGames(r.games ?? []);
          if (r.counts) setCounts(r.counts);
          if (typeof r.hot_count === "number") setHotCount(r.hot_count);
        }
      } catch { /* aborted or offline — keep the last grid */ }
      finally { setBusy(false); setLoading(false); }
    }, query ? 220 : 0); // tiny debounce so typing does not fire a request per key
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [mode, query]);

  // favourites can live in any category, so they are fetched by code
  useEffect(() => {
    if (!favs || favs.length === 0) { setFavGames([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/games?codes=${encodeURIComponent(favs.slice(0, 40).join(","))}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(r => { if (r?.ok) setFavGames(r.games ?? []); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [favs]);

  // favorites: localStorage; on first-ever visit seed from is_favorite_default
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sonali7_favs");
      setFavs(raw ? JSON.parse(raw) : null);
    } catch { setFavs([]); }
  }, []);
  useEffect(() => {
    if (favs === null && games.length) {
      setFavs(games.filter(g => g.is_favorite_default).map(g => g.game_code));
    }
  }, [favs, games]);
  useEffect(() => { if (favs !== null) try { localStorage.setItem("sonali7_favs", JSON.stringify(favs)); } catch {} }, [favs]);

  const toggleFav = (code: string) => setFavs(v => { const list = v ?? []; return list.includes(code) ? list.filter(c => c !== code) : [...list, code]; });

  // Search already ran on the server; provider + (defensive) search filter remain local.
  const visible = useMemo(() => games.filter(g => {
    if (provider !== "ALL" && g.provider_code !== provider) return false;
    if (!query) return true;
    return true;
  }), [games, provider, query]);
  const inCategory = visible;
  const favorites = favGames;
  const providerCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of games) m.set(g.provider_code, (m.get(g.provider_code) || 0) + 1);
    return m;
  }, [games]);
  const providerOptions = useMemo(
    () => Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code),
    [providerCounts]
  );
  const providerValueValid = provider === "ALL" || providerCounts.has(provider);

  return (
    <div className="mt-2.5 flex border-t border-[#F5B800]/15 pt-2">
      {/* ── LEFT CATEGORY RAIL (icon-first, compact) ─────────────── */}
      <aside className="w-[58px] shrink-0 flex flex-col items-center gap-1 px-0.5 max-h-[74vh] overflow-y-auto lg:w-[190px] lg:items-stretch lg:gap-1.5 lg:overflow-y-auto lg:pr-2.5 lg:max-h-[calc(100vh-140px)] lg:sticky lg:top-[92px]">
        {/* HOT — the default landing tab. Every tile here is is_hot, straight from
            the server, so the homepage opens on "what is actually being played". */}
        <button onClick={() => { setMode("HOT"); setProvider("ALL"); }}
          title={lang === "bn" ? "হট গেম" : "Hot games"}
          className={`relative w-full rounded-lg border px-0.5 py-1 flex flex-col items-center gap-[2px] transition-all active:scale-95 lg:flex-row lg:justify-start lg:gap-2 lg:px-2.5 lg:py-2
            ${mode === "HOT" ? "border-[#ff7a18] bg-gradient-to-b from-[#ff9d2e] to-[#e8590c] text-[#1a1300] shadow-gold" : "border-white/8 bg-[#1B1B1B] text-white/55"}`}>
          <Flame size={16} strokeWidth={mode === "HOT" ? 2.4 : 2} />
          <span className={`w-full truncate text-center text-[7px] leading-none font-black lg:text-left lg:text-[11px] ${mode === "HOT" ? "" : "text-white/60"}`}>
            {lang === "bn" ? "হট" : "HOT"}
          </span>
          {hotCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#F5B800] px-1 text-[6px] font-black text-[#1a1300] tabular-nums">
              {hotCount > 999 ? `${Math.floor(hotCount / 100) / 10}k` : hotCount}
            </span>
          )}
        </button>

        {CATEGORIES.map(({ id, key_i18n, icon: Icon }) => {
          const active = mode === id;
          return (
            <button key={id} onClick={() => { setMode(id); setProvider("ALL"); }}
              title={t(key_i18n)}
              className={`relative w-full rounded-lg border px-0.5 py-1 flex flex-col items-center gap-[2px] transition-all active:scale-95 lg:flex-row lg:justify-start lg:gap-2 lg:px-2.5 lg:py-2
                ${active ? "border-[#F5B800] bg-gradient-to-b from-[#F5B800] to-[#c98f00] text-[#1a1300] shadow-gold" : "border-white/8 bg-[#1B1B1B] text-white/55"}`}>
              <Icon size={16} strokeWidth={active ? 2.4 : 2} />
              <span className={`w-full truncate text-center text-[7px] leading-none font-black lg:text-left lg:text-[11px] ${active ? "" : "text-white/60"}`}>{t(key_i18n)}</span>
            </button>
          );
        })}

        <div className="my-0.5 h-px w-8 bg-[#F5B800]/20 lg:my-1 lg:w-full" />
        <label className="w-full" title={lang === "bn" ? "প্রোভাইডার ফিল্টার" : "Filter by provider"}>
          <select value={providerValueValid ? provider : "ALL"} onChange={e => setProvider(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#1B1B1B] px-0.5 py-1 text-center text-[6.5px] font-black uppercase text-white/65 outline-none focus:border-[#F5B800]/60 lg:px-2 lg:py-1.5 lg:text-left lg:text-[10px]"
            aria-label={lang === "bn" ? "প্রোভাইডার দিয়ে গেম ফিল্টার করুন" : "Filter games by provider"}>
            <option value="ALL">{lang === "bn" ? "সব" : "ALL"}</option>
            {providerOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </aside>

      {/* ── RIGHT GAME GRID ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 pr-2 pl-1.5">
        {/* ── SEARCH (499bet-style: name field + "All" provider chip) ── */}
        <div className="flex items-center gap-1 mb-1.5">
          <div className="relative flex-1">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              inputMode="search"
              placeholder={lang === "bn" ? "খেলার নাম" : "Game name"}
              aria-label={lang === "bn" ? "খেলা খুঁজুন" : "Search games"}
              className="h-[30px] w-full rounded-md border border-white/20 bg-[#1B1B1B] pl-6 pr-6 text-[10px] font-bold text-white placeholder:text-white/35 outline-none focus:border-[#F5B800]/70"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label={lang === "bn" ? "মুছুন" : "Clear search"}
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/70 active:scale-90">
                <X size={11} strokeWidth={3} />
              </button>
            )}
          </div>
          <button
            onClick={() => { setProvider("ALL"); setQ(""); }}
            className={`h-[30px] shrink-0 rounded-md border px-2 text-[9.5px] font-black transition-colors ${
              provider === "ALL" && !query
                ? "border-[#F5B800] bg-[#F5B800] text-[#1a1300]"
                : "border-white/20 bg-[#1B1B1B] text-white/70"}`}>
            {lang === "bn" ? "সব দেখুন" : "All"}
          </button>
        </div>
        {loading ? (
          <div className="grid grid-cols-3 gap-[5px] lg:grid-cols-6 lg:gap-2.5">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-[1/1.15] rounded-xl bg-white/5 animate-pulse" />)}</div>
        ) : query ? (
          <section>
            <div className="flex items-center justify-between px-1 mb-1">
              <h3 className="text-[10px] font-black tracking-[.12em] text-[#F5B800] uppercase">
                {lang === "bn" ? "সার্চ ফলাফল" : "SEARCH RESULTS"}
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-1.5 text-[7.5px] font-bold text-white/45 tabular-nums">{visible.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-[5px] lg:grid-cols-6 lg:gap-2.5">
              {visible.slice(0, shown).map((g, i) => <Tile key={g.game_code} g={g} eager={i < 3} fav={favList.includes(g.game_code)} lang={lang} onLaunch={onLaunch} onToggleFav={toggleFav} />)}
            </div>
            {visible.length === 0 && (
              <p className="py-8 text-center text-[10.5px] text-white/40">
                {lang === "bn" ? "কোনো খেলা পাওয়া যায়নি" : "No games found"}
              </p>
            )}
            {visible.length > shown && (
              <button onClick={() => setShown(n => n + PAGE_SIZE)}
                className="mt-2 h-9 w-full rounded-xl border border-[#F5B800]/45 bg-[#F5B800]/10 text-[10.5px] font-black text-[#F5B800] active:scale-[.98] transition-transform">
                {lang === "bn" ? `আরও দেখুন (${visible.length - shown} টি বাকি)` : `Load more (${visible.length - shown} left)`}
              </button>
            )}
          </section>
        ) : (
          <>
            <Section title={t("my_favorites")} items={favorites} icon={<Heart size={10} className="fill-[#F5B800]" />} favList={favList} lang={lang} onLaunch={onLaunch} onToggleFav={toggleFav} />
            {mode === "HOT" ? (
              /* HOT is one section, paged exactly like a category — before this the
                 hot list was rendered twice and unpaged, which put 300+ tiles and
                 ~14,000 px of DOM on the phone at once (the actual scroll lag). */
              <Section title={lang === "bn" ? "🔥 হট গেম" : "🔥 HOT GAMES"} items={inCategory} limit={shown} icon={null} favList={favList} lang={lang} onLaunch={onLaunch} onToggleFav={toggleFav} />
            ) : (
            <section>
              <div className="flex items-center justify-between px-1 mb-1 mt-1.5">
                <h3 className="flex items-center gap-1 text-[10px] font-black tracking-[.12em] text-white/75 uppercase"><Star size={10} className="text-[#F5B800]" />{t(CATEGORIES.find(c => c.id === category)!.key_i18n)}</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-1.5 text-[7.5px] font-bold text-white/45 tabular-nums">{inCategory.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-[5px] lg:grid-cols-6 lg:gap-2.5">{inCategory.slice(0, shown).map((g, i) => <Tile key={g.game_code} g={g} eager={i < 3} fav={favList.includes(g.game_code)} lang={lang} onLaunch={onLaunch} onToggleFav={toggleFav} />)}</div>
              {inCategory.length === 0 && <p className="text-center text-[10px] text-white/35 py-6">{lang === "bn" ? "এই ক্যাটাগরিতে কোনো খেলা নেই" : "No games in this category yet"}</p>}
            </section>
            )}
            {mode !== "HOT" && inCategory.length > shown && (
              <button
                onClick={() => setShown(n => n + PAGE_SIZE)}
                className="mt-2 h-9 w-full rounded-xl border border-[#F5B800]/45 bg-[#F5B800]/10 text-[10.5px] font-black text-[#F5B800] active:scale-[.98] transition-transform">
                {lang === "bn"
                  ? `আরও দেখুন (${inCategory.length - shown} টি বাকি)`
                  : `Load more (${inCategory.length - shown} left)`}
              </button>
            )}
            {mode === "HOT" && inCategory.length > shown && (
              <button
                onClick={() => setShown(n => n + PAGE_SIZE)}
                className="mt-2 h-9 w-full rounded-xl border border-[#F5B800]/45 bg-[#F5B800]/10 text-[10.5px] font-black text-[#F5B800] active:scale-[.98] transition-transform">
                {lang === "bn"
                  ? `আরও দেখুন (${inCategory.length - shown} টি বাকি)`
                  : `Load more (${inCategory.length - shown} left)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
