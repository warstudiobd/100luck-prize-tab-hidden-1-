"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Coins, Crown, RefreshCw } from "lucide-react";
import { formatTaka } from "@/lib/format";
import { LangProvider, useLang } from "@/components/lang";

const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "👑", "7️⃣"];
const BETS = [1000, 5000, 10000, 50000]; // cents
/** Free trial money: ৳১,০০০ of practice credits, refillable, never the real wallet. */
const TRIAL_START = 100000; // ৳1,000 in cents
const TRIAL_KEY = "sonali7_trial_balance";

function DemoSlot() {
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const gameCode = params.get("game") || "jili_super_ace";
  const gameTitle = params.get("title") || "";

  // Trial credits live on the device, not in the wallet — a trial is practice money.
  const [balance, setBalance] = useState<number | null>(null);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [bet, setBet] = useState(1000);
  const [reels, setReels] = useState<string[]>(["🍒", "⭐", "👑"]);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState<number | null>(null);
  const [message, setMessage] = useState(() => lang === "bn" ? "স্পিন চাপুন — ডেমো মোড" : "SPIN to play · Demo mode");
  const [spins, setSpins] = useState(0);
  const [inIframe, setInIframe] = useState(false);
  const shuffleTimer = useRef<number | null>(null);
  useEffect(() => { try { setInIframe(window.self !== window.top); } catch { setInIframe(true); } }, []);

  // Load the trial credits (and, for context only, the real balance).
  const refreshBalance = useCallback(async () => {
    let trial = TRIAL_START;
    try {
      const raw = localStorage.getItem(TRIAL_KEY);
      // NB: Number(null) === 0 — a missing key must mean "fresh trial", not "empty".
      const saved = raw === null ? NaN : Number(raw);
      if (Number.isFinite(saved) && saved > 0) trial = saved;
      else localStorage.setItem(TRIAL_KEY, String(trial));
    } catch {}
    setBalance(trial);
    const r = await fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.user) { setAuthed(true); setRealBalance(r.user.balance_cents); } else { setAuthed(false); setRealBalance(null); }
  }, []);

  const persistTrial = (cents: number) => {
    setBalance(cents);
    try { localStorage.setItem(TRIAL_KEY, String(cents)); } catch {}
  };

  const refillTrial = () => {
    persistTrial(TRIAL_START);
    setWin(null);
    setMessage(lang === "bn" ? "💰 ফ্রি ট্রায়াল ব্যালেন্স রিফিল হয়েছে" : "💰 Trial balance refilled");
  };
  useEffect(() => { refreshBalance(); }, [refreshBalance]);

  async function spin() {
    if (spinning || balance === null) return;
    if (balance < bet) { setMessage(lang === "bn" ? "❌ ট্রায়াল ব্যালেন্স শেষ — রিফিল করুন" : "❌ Trial credits used up — tap Refill"); return; }
    setSpinning(true); setWin(null); setMessage("…");
    shuffleTimer.current = window.setInterval(() => {
      setReels([SYMBOLS[Math.floor(Math.random() * 7)], SYMBOLS[Math.floor(Math.random() * 7)], SYMBOLS[Math.floor(Math.random() * 7)]]);
    }, 75);

    try {
      const r = await fetch("/api/games/demo-spin", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ game_code: gameCode, bet_cents: bet, trial_balance_cents: balance }),
      }).then(r => r.json());

      window.setTimeout(() => {
        if (shuffleTimer.current) window.clearInterval(shuffleTimer.current);
        if (r.ok) {
          setReels(r.reels);
          persistTrial(r.trial_balance_cents);
          if (typeof r.real_balance_cents === "number") setRealBalance(r.real_balance_cents);
          setSpins(s => s + 1);
          if (r.win_cents > 0) {
            setWin(r.win_cents);
            setMessage(r.multiplier >= 10 ? (lang === "bn" ? "🏆 জ্যাকপট!!! 🏆" : "🏆 JACKPOT!!! 🏆") : r.multiplier >= 5 ? (lang === "bn" ? "🔥 বড় জয়! 🔥" : "🔥 BIG WIN! 🔥") : (lang === "bn" ? "✨ জিতেছেন! ✨" : "✨ Winner! ✨"));
          } else {
            setMessage(lang === "bn" ? "আবার চেষ্টা করুন…" : "Try again…");
          }
        } else {
          setMessage(r.error === "trial_balance_exhausted"
            ? (lang === "bn" ? "❌ ট্রায়াল ব্যালেন্স শেষ — রিফিল করুন" : "❌ Trial credits used up — tap Refill")
            : (r.error || (lang === "bn" ? "স্পিন ব্যর্থ হয়েছে" : "Spin failed")));
        }
        setSpinning(false);
      }, 950);
    } catch {
      if (shuffleTimer.current) window.clearInterval(shuffleTimer.current);
      setMessage(lang === "bn" ? "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন" : "Network error — try again");
      setSpinning(false);
      refreshBalance();
    }
  }

  if (authed === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#121212] text-center px-8">
        <Crown size={48} className="text-[#F5B800]" />
        <p className="text-white/80 font-bold">{lang === "bn" ? "ডেমো গেম খেলতে লগইন করুন" : "Log in to play the demo game"}</p>
        <button onClick={() => router.push("/")} className="gold-btn h-11 rounded-xl px-6 text-sm">{lang === "bn" ? "লবিতে ফিরুন" : "Back to Lobby"}</button>
      </div>
    );
  }

  return (
    <div className={`${inIframe ? "min-h-[calc(100vh-3.5rem)] mt-14" : "min-h-screen"} bg-[#0d0d0d] text-white flex flex-col max-w-[480px] mx-auto relative overflow-hidden`}>
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(420px 300px at 50% 18%, rgba(245,184,0,.14), transparent 65%), radial-gradient(300px 300px at 50% 85%, rgba(226,19,110,.12), transparent 60%)" }} />

      {/* Top bar */}
      <div className="relative flex items-center justify-between gap-2 px-3 h-14 border-b border-[#F5B800]/20 bg-black/60 backdrop-blur">
        {!inIframe && (
          <button onClick={() => router.push("/")} className="flex h-9 items-center gap-1.5 rounded-full border border-[#F5B800]/50 bg-black/70 pl-2 pr-3 text-[11px] font-black text-[#F5B800]">
            <ArrowLeft size={15} strokeWidth={2.6} /> {lang === "bn" ? "লবি" : "Lobby"}
          </button>
        )}
        <p className="gold-text text-xs font-black tracking-widest truncate max-w-[190px]">{(gameTitle || gameCode.replace(/_/g, " ")).toUpperCase()}</p>
        <div className="flex items-center gap-1">
          <button onClick={refillTrial} title={lang === "bn" ? "ট্রায়াল ব্যালেন্স রিফিল" : "Refill trial credits"}
            className="flex h-[26px] items-center gap-1 rounded border border-[#3ba9ff]/50 bg-[#3ba9ff]/15 px-1.5 text-[9.5px] font-black text-[#7dc6ff] tabular-nums active:scale-95">
            <Coins size={10} />{balance === null ? "…" : formatTaka(balance)}
            <RefreshCw size={9} strokeWidth={3} className="opacity-60" />
          </button>
        </div>
      </div>

      {/* Reels */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-5 px-6 py-6">
        <p className="text-[9px] uppercase tracking-[.4em] text-white/35">{lang === "bn" ? "ডিলিউক্স ডেমো স্লট · ডেমো মোড" : "Deluxe Demo Slot · DEMO MODE"}</p>
        <p className="rounded-full border border-[#3ba9ff]/35 bg-[#3ba9ff]/10 px-2.5 py-1 text-center text-[9px] font-bold text-[#7dc6ff]">
          {lang === "bn"
            ? "🎁 ফ্রি ট্রায়াল — এগুলো প্র্যাকটিস টাকা, আসল ব্যালেন্স ব্যবহার হয় না"
            : "🎁 Free trial — this is practice money, your real balance is never used"}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {reels.map((s, i) => (
            <div key={i} className="h-28 w-24 sm:w-28 flex items-center justify-center rounded-2xl border-2 border-[#F5B800]/55 bg-gradient-to-b from-[#262626] via-[#141414] to-[#262626] shadow-[inset_0_2px_8px_rgba(255,255,255,.06),0_0_30px_rgba(245,184,0,.12)]">
              <span className={`text-6xl ${spinning ? "reel-spinning" : ""}`}>{s}</span>
            </div>
          ))}
        </div>

        <p className={`h-6 text-sm font-black tracking-wide ${win ? "text-[#F5B800] jackpot-pop text-xl" : "text-white/55"}`}>{win ? `+${formatTaka(win)}` : message}</p>

        {/* Bet selector */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold mr-1">{lang === "bn" ? "বাজি" : "Bet"}</span>
          {BETS.map(b => (
            <button key={b} disabled={spinning} onClick={() => setBet(b)}
              className={`h-9 rounded-lg border px-2.5 text-[10px] font-black tabular-nums transition-all ${bet === b ? "border-[#F5B800] bg-[#F5B800]/20 text-[#F5B800]" : "border-white/12 bg-white/5 text-white/55"}`}>
              {formatTaka(b, false)}
            </button>
          ))}
        </div>

        {/* Spin button */}
        <button onClick={spin} disabled={spinning || balance === null}
          className="relative h-24 w-24 rounded-full border-4 border-[#ffe066]/80 bg-gradient-to-b from-[#ffe066] via-[#F5B800] to-[#8a6500] shadow-[0_6px_0_#5c4400,0_14px_44px_rgba(245,184,0,.4)] active:translate-y-1 active:shadow-[0_2px_0_#5c4400] transition-all disabled:opacity-60 flex flex-col items-center justify-center">
          {spinning ? <Loader2 size={30} className="animate-spin text-[#1a1300]" /> : <><span className="text-lg font-black text-[#1a1300] leading-none">SPIN</span><span className="text-[8px] font-black text-[#1a1300]/70 mt-0.5 tracking-widest">৳{(bet / 100).toFixed(0)}</span></>}
        </button>

        <p className="text-[8px] text-white/25 tracking-widest uppercase">{lang === "bn" ? `স্পিন: ${spins} · প্রমাণযোগ্য ফেয়ার ডেমো · RTP ~৯১%` : `Spins: ${spins} · Provably fair demo · RTP ~91%`}</p>
        {realBalance !== null && (
          <p className="text-[8px] text-white/35">
            {lang === "bn" ? `আপনার আসল ব্যালেন্স ${formatTaka(realBalance)} — অপরিবর্তিত` : `Real balance ${formatTaka(realBalance)} — untouched`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function DemoSlotPage() {
  return (
    <LangProvider initial="bn">
      <Suspense fallback={<div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center"><Loader2 className="animate-spin text-[#F5B800]" size={32} /></div>}>
        <DemoSlot />
      </Suspense>
    </LangProvider>
  );
}
