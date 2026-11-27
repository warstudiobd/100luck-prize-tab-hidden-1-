"use client";
/**
 * AppShell — the frame every screen is rendered inside.
 *
 * Routing model (rewritten): each screen is a real route. `tab` and the cashier
 * sub-page are derived from `usePathname()`, never held in state, so:
 *
 *   • the browser Back button goes back one screen, not to the home page;
 *   • Forward works the same way;
 *   • every tab bar item / "back" arrow is a real <Link> — middle-click and
 *     "open in new tab" behave like a normal website;
 *   • a refresh on /withdraw/records stays on /withdraw/records.
 *
 * Nothing is rendered on the client for the route itself — the page files call
 * `Shell tab="deposit"`, so the server already knows which screen to draw.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LangProvider, useLang } from "./lang";
import Header from "./Header";
import BottomBar from "./BottomBar";
import Toast from "./Toast";
import AuthModal from "./AuthModal";
import Launcher from "./Launcher";
import GameLaunchSheet, { type LaunchGameInfo } from "./GameLaunchSheet";
import HomeView from "./home/HomeView";
import DownloadFab from "./DownloadFab";
import SitePopup from "./SitePopup";
import DepositView from "./views/DepositView";
import WithdrawView from "./views/WithdrawView";
import PromoView from "./views/PromoView";
import MemberView from "./views/MemberView";
import WalletBindView from "./views/WalletBindView";
import PrizeHub from "./prizes/PrizeHub";
import PrizeWheel from "./prizes/PrizeWheel";
import PrizeEnvelope from "./prizes/PrizeEnvelope";
import PrizeEggs from "./prizes/PrizeEggs";
import SupportView from "./views/SupportView";
import AppView from "./views/AppView";
import WithdrawRecordsView from "./views/WithdrawRecordsView";
import type { SessionUser } from "@/lib/types";
import {
  type TabKey, type CashierSub, type PrizeSub, type MemberSub, pathForTab, pathForSub,
  tabFromPath, subFromPath, prizeSubFromPath, memberSubFromPath,
} from "@/lib/routes";

export default function AppShell() {
  return (
    <LangProvider initial="bn">
      <Shell />
    </LangProvider>
  );
}

/** Screen picked by the route file; when omitted it is read from the URL. */
export function ShellRoute({ tab }: { tab?: TabKey }) {
  return (
    <LangProvider initial="bn">
      <Shell routeTab={tab} />
    </LangProvider>
  );
}

function Shell({ routeTab }: { routeTab?: TabKey }) {
  const { lang } = useLang();
  const pathname = usePathname() || "/";
  const router = useRouter();

  // The URL is the source of truth; the page file may pass the tab it was built for.
  const tab: TabKey = routeTab ?? tabFromPath(pathname);
  const cashierPage: CashierSub | null = useMemo(() => subFromPath(pathname), [pathname]);
  const prizePage: PrizeSub | null = useMemo(() => prizeSubFromPath(pathname), [pathname]);
  const memberPage: MemberSub | null = useMemo(() => memberSubFromPath(pathname), [pathname]);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  /** Old links: /?tab=deposit, /?login=1 → the real route, without adding history. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const login = params.get("login") === "1";

    if (t && pathname === "/" && (t === "deposit" || t === "promo" || t === "promotion" || t === "withdraw" || t === "member")) {
      const keep = new URLSearchParams(params);
      keep.delete("tab");
      const qs = keep.toString();
      router.replace(pathForTab(t === "promotion" ? "promo" : (t as TabKey)) + (qs ? `?${qs}` : ""));
      return;
    }
    if (login) {
      setAuthOpen(true);
      params.delete("login");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [launch, setLaunch] = useState<{ url: string; title: string; demo: boolean } | null>(null);
  // Tap a tile → this sheet opens; nothing is requested from the provider until the
  // player picks Play (real money) or Free Trial (demo).
  const [sheet, setSheet] = useState<LaunchGameInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refreshUser = useCallback(async (): Promise<SessionUser | null> => {
    const r = await fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    const u = (r?.user ?? null) as SessionUser | null;
    setUser(u);
    return u;
  }, []);
  useEffect(() => { refreshUser(); }, [refreshUser]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 3400);
  }, []);

  /**
   * Launch links we already asked the server for, keyed by game+mode.
   *
   * Opening a real-money game used to be: tap Play → wait ~1.5 s for the provider →
   * then wait again for the provider's game page to boot. Those two waits ran one
   * after the other. Now the link is requested as soon as the Play sheet opens, so
   * the first wait happens while the player is still reading the sheet, and tapping
   * Play only waits for the game page itself.
   */
  const prefetched = useRef(new Map<string, string>());
  const inflight = useRef(new Map<string, Promise<string | null>>());
  const launchErrors = useRef(new Map<string, unknown>());

  const requestLaunch = useCallback(async (game: LaunchGameInfo, mode: "real" | "trial"): Promise<string | null> => {
    const key = `${game.game_code}:${mode}`;
    const cached = prefetched.current.get(key);
    if (cached) return cached;
    const pending = inflight.current.get(key);
    if (pending) return pending;
    const job = fetch("/api/games/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game_code: game.game_code, lang, mode }),
    }).then(r => r.json()).catch(() => null).then(r => {
      inflight.current.delete(key);
      if (r?.ok && r?.launch_url) {
        prefetched.current.set(key, String(r.launch_url));
        launchErrors.current.delete(key);
        return String(r.launch_url);
      }
      // Keep the reason (phone missing, provider down) per game so it can be shown.
      if (r) launchErrors.current.set(key, r);
      return null;
    });
    inflight.current.set(key, job);
    return job;
  }, [lang]);

  /** Tile tap: open the Play / Free Trial sheet instead of launching immediately. */
  const openGameSheet = useCallback((game: LaunchGameInfo) => {
    setSheet(game);
    // Warm the real-money link up front. Guests are skipped: they would just be told
    // to log in, and trial mode is a separate provider call.
    if (user) void requestLaunch(game, "real");
  }, [user, requestLaunch]);

  /** Launch the game in the requested mode ("real" | "trial"). */
  const launchGame = useCallback(async (game: LaunchGameInfo, mode: "real" | "trial") => {
    if (mode === "real" && !user) { setSheet(null); setAuthOpen(true); return; }
    const title = lang === "bn" && game.title_bn ? game.title_bn : game.title;
    const key = `${game.game_code}:${mode}`;
    const url = await requestLaunch(game, mode);
    type LaunchErr = { ok?: boolean; error?: string; message?: string };
    const r: LaunchErr & { launch_url?: string; demo?: boolean } = url
      ? { ok: true, launch_url: url }
      : ((launchErrors.current.get(key) as LaunchErr | undefined) || {});
    if (!r?.ok) {
      if (r?.error === "PLAYER_PHONE_REQUIRED") {
        setSheet(null);
        router.push(pathForTab("member"));
        showToast(r?.message || "Real-money launch needs your phone number first");
      } else {
        showToast(r?.message || r?.error || "লঞ্চ ব্যর্থ — চেষ্টা করুন আবার");
      }
      return;
    }
    setSheet(null);
    setLaunch({ url: String(r.launch_url), title, demo: !!r.demo });
  }, [user, showToast, lang, router]);

  const closeLauncher = useCallback(() => { setLaunch(null); refreshUser(); }, [refreshUser]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push(pathForTab("home"));
    showToast("লগআউট হয়েছে — আবার আসবেন!");
  }, [showToast, router]);

  /**
   * Back arrow on a screen: one step back in history when we got here from inside
   * the site, otherwise straight to the tab's parent page. Never "always home".
   */
  const goBack = useCallback((fallback: string) => {
    try {
      if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
        router.back();
        return;
      }
    } catch { /* fall through */ }
    router.push(fallback);
  }, [router]);

  const goTab = useCallback((t: TabKey) => router.push(pathForTab(t)), [router]);
  const goSub = useCallback((s: CashierSub) => router.push(pathForSub(s)), [router]);

  return (
    <div data-luck="app" className="min-h-screen bg-[#121212] text-white font-sans">
      <SitePopup />
      {/* Desktop side frame decorations */}
      <div aria-hidden className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[calc(50vw-240px)] items-center justify-center pointer-events-none select-none">
        <p className="text-[120px] font-black text-white/[.03] leading-none [writing-mode:vertical-rl] rotate-180 tracking-tighter">100LUCK</p>
      </div>
      <div aria-hidden className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[calc(50vw-240px)] items-center justify-center pointer-events-none select-none">
        <p className="text-[120px] font-black text-[#F5B800]/[.04] leading-none [writing-mode:vertical-rl] tracking-tighter">১০০লাক</p>
      </div>

      <Header
        user={user}
        onRefreshBalance={async () => { await refreshUser(); }}
        onAuthClick={() => (user ? goTab("member") : setAuthOpen(true))}
        onLogoClick={() => goTab("home")}
        onDepositClick={() => goTab("deposit")}
      />

      {/* Mobile viewport container — top offset matches the two-row header (50px + 26px) */}
      <main className="mx-auto min-h-screen w-full max-w-[480px] bg-[#121212] border-x border-white/5 pt-[78px] pb-[76px] lg:max-w-[1180px] lg:border-x-0 lg:pt-[86px] lg:pb-[92px]">
        <div key={pathname} className="tab-fade">
        {tab === "home"     && <HomeView onLaunch={openGameSheet} showToast={showToast} setTab={goTab} onAuthClick={() => setAuthOpen(true)} />}
        {tab === "deposit"  && <DepositView user={user} onAuthClick={() => setAuthOpen(true)} showToast={showToast} onBack={() => goBack("/")} goTab={goTab} />}
        {tab === "promo"    && <PromoView showToast={showToast} user={user} onAuthClick={() => setAuthOpen(true)} refreshUser={refreshUser} />}
        {tab === "withdraw" && cashierPage === null && (
          <WithdrawView user={user} onAuthClick={() => setAuthOpen(true)} showToast={showToast} refreshUser={refreshUser}
            goBind={() => goSub("bind")} goRecords={() => goSub("records")} onBack={() => goBack("/")} />
        )}
        {tab === "withdraw" && cashierPage === "bind"    && <WalletBindView showToast={showToast} onBack={() => goBack("/withdraw")} />}
        {tab === "withdraw" && cashierPage === "records" && <WithdrawRecordsView showToast={showToast} onBack={() => goBack("/withdraw")} goBind={() => goSub("bind")} />}
        {tab === "prizes" && prizePage === null          && <PrizeHub />}
        {tab === "prizes" && prizePage === "spin"        && <PrizeWheel />}
        {tab === "prizes" && prizePage === "envelope"    && <PrizeEnvelope />}
        {tab === "prizes" && prizePage === "egg"         && <PrizeEggs />}
        {tab === "app" && <AppView />}
        {tab === "member" && memberPage === "support" && <SupportView user={user} onAuthClick={() => setAuthOpen(true)} />}
        {tab === "member" && memberPage === null && <MemberView user={user} onAuthClick={() => setAuthOpen(true)} onLogout={logout} showToast={showToast} refreshUser={refreshUser} goTab={goTab} />}
        </div>
      </main>

      {/* The one floating app logo — tap = APK download (replaces the old install bubble).
          Hidden on Profile: there it sat on top of the ledger rows, and the profile
          screen is not a place to push installs (the header APP chip still does). */}
      {tab !== "member" && <DownloadFab />}
      {/* The prize dock rides on every player screen (v51) except the prize
          screens themselves — there it would cover the cards it links to. */}
      {/* The dock is hidden on the prize screens (it would cover the cards), on the
          support section (ticket buttons) and on Profile, where it covered the
          ledger history. */}
      {/* Prize surfaces are temporarily hidden across the app. */}
      {/* Support is our own ticket chat (/member/support) — the SaleSmartly vendor
          plugin was removed from the codebase entirely in v53. */}
      <BottomBar tab={tab} />

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={(msg) => { setAuthOpen(false); refreshUser(); showToast(msg); }} />}
      {sheet && (
        <GameLaunchSheet
          game={sheet}
          isLoggedIn={!!user}
          balanceLabel={user ? `৳${(user.balance_cents / 100).toFixed(2)}` : undefined}
          onClose={() => setSheet(null)}
          onPlay={() => launchGame(sheet, "real")}
          onTrial={() => launchGame(sheet, "trial")}
        />
      )}
      {launch && <Launcher url={launch.url} title={launch.title} demo={launch.demo} onClose={closeLauncher} />}
      {toast && <Toast msg={toast} />}
    </div>
  );
}
