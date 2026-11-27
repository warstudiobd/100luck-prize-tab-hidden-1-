"use client";
/**
 * লাকি স্পিন — the festival wheel (v51).
 *
 * Spins are free and earned from successful deposits of ৳500 or more.
 * The server credits exactly ৳6 per earned spin; this component only animates
 * the server-confirmed result.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles, X } from "lucide-react";
import { useLang } from "../lang";
import { formatTaka } from "@/lib/format";

const SLICES = Array.from({ length: 8 }, (_, i) => ({ key: i === 0 ? "p6" : `p6-${i}`, bn: "৳৬", en: "৳6" }));
const SLICE = 360 / SLICES.length;

type Promo = {
  ok?: boolean; logged_in?: boolean; balance_cents: number; fee_cents: number; wheel_fee_cents: number;
  wheel_spins_available?: number;
  progress_cents: number; daily_target_cents: number; turnover_cents: number;
  open_tickets: number; recent: Array<{ who: string; amount_cents: number }>;
  my_wheel: Array<{ prize_key: string; prize_cents: number; physical: boolean; created_at: string }>;
};

export default function PrizeWheel() {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [state, setState] = useState<Promo | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "spinning" | "won">("loading");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ key: string; cents: number; physical: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const spinning = useRef(false);
  const settleTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/prizes", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) { setState(r as Promo); setPhase("ready"); }
    else setPhase("ready");
  }, []);
  useEffect(() => { load(); }, [load]);

  const conic = useMemo(() => SLICES.map((_, i) =>
    `${i % 2 === 0 ? "#8E0E05" : "#C1120A"} ${i * SLICE}deg ${(i + 1) * SLICE}deg`
  ).join(", "), []);

  const spin = async () => {
    if (spinning.current) return;
    spinning.current = true;
    setPhase("spinning");
    setToast(null);
    try {
      const r = await fetch("/api/prizes/spin", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await r.json().catch(() => null);
      if (r.status === 401) { setToast(T("Log in to spin", "স্পিন করতে লগইন করুন")); setPhase("ready"); spinning.current = false; return; }
      if (!r.ok || !d?.ok) {
        setToast(lang === "bn" ? (d?.error_bn || d?.error || "স্পিন ব্যর্থ") : (d?.error || "Spin failed"));
        setPhase("ready"); spinning.current = false; return;
      }
      const idx = Math.max(0, SLICES.findIndex(s => s.key === d.prize_key));
      const desiredMod = ((360 - (idx * SLICE + SLICE / 2)) % 360 + 360) % 360;
      const currentMod = ((rotation % 360) + 360) % 360;
      const delta = (desiredMod - currentMod + 360) % 360;
      setRotation(rotation + 360 * 6 + delta);
      setResult({ key: String(d.prize_key), cents: Number(d.prize_cents), physical: Boolean(d.physical) });
      /* transitionend alone is not reliable (a backgrounded tab can drop it), so the
         reveal is armed on a timer that matches the 4s animation and guarded by the
         same ref that blocks a second tap. */
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => settle(), 4050);
      load();
    } catch {
      setToast(T("Network error", "নেটওয়ার্ক সমস্যা"));
      setPhase("ready");
      spinning.current = false;
    }
  };

  /** Show the result exactly once (timer or transitionend, whichever comes first). */
  const settle = () => {
    if (!spinning.current) return;
    spinning.current = false;
    if (settleTimer.current) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
    setPhase("won");
  };

  useEffect(() => () => { if (settleTimer.current) window.clearTimeout(settleTimer.current); }, []);

  const spinsAvailable = Number(state?.wheel_spins_available ?? 0);

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_50%_0%,#5a0d10,#1a0507_60%,#121212_100%)] pb-6">
      {/* header */}
      <div className="flex items-center justify-between px-3 pt-2">
        <Link href="/prizes" prefetch aria-label={T("Back", "পেছনে")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
          <ChevronLeft size={16} />
        </Link>
        <p className="text-[13px] font-black tracking-wide text-[#FFE9A3]">{T("Lucky wheel", "লাকি স্পিন")}</p>
        <Link href="/" prefetch aria-label={T("Close", "বন্ধ")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
          <X size={15} />
        </Link>
      </div>

      {/* the wheel */}
      <div className="relative mx-auto mt-3 h-[268px] w-[268px]">
        <div aria-hidden className="absolute inset-0 rounded-full bg-[#FFD75E]/25 blur-2xl" />
        {/* pointer */}
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[12px] border-x-transparent border-t-[22px] border-t-[#FFE9A3] drop-shadow-[0_2px_4px_rgba(0,0,0,.6)]" />
        </div>
        <div
          className="relative h-full w-full rounded-full border-[6px] border-[#FFD75E] shadow-[0_0_36px_rgba(255,197,61,.45),inset_0_0_24px_rgba(0,0,0,.6)]"
          style={{ background: `conic-gradient(${conic})`, transform: `rotate(${rotation}deg)`, transition: "transform 4s cubic-bezier(.14,.86,.22,1)" }}
          onTransitionEnd={settle}
        >
          {SLICES.map((s, i) => (
            <div key={s.key} className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%,-50%) rotate(${i * SLICE + SLICE / 2}deg) translateY(-96px) rotate(${-rotation}deg)`,
                transition: "transform 4s cubic-bezier(.14,.86,.22,1)",
              }}>
              <span className="block whitespace-nowrap text-center text-[12px] font-black text-[#FFF3C4]"
                style={{ textShadow: "0 1px 3px #000" }}>
                {lang === "bn" ? s.bn : s.en}
              </span>
              <span className="mt-3 block text-center text-[14px]">🎁</span>
            </div>
          ))}
          {/* hub is counter-rotated so GO always reads upright */}
          <button onClick={spin} disabled={phase === "spinning"}
            aria-label={T("Spin the wheel", "চাকা ঘোরান")}
            className="absolute left-1/2 top-1/2 flex h-[66px] w-[66px] flex-col items-center justify-center rounded-full border-2 border-[#FFE9A3] bg-[radial-gradient(circle_at_35%_25%,#FF6B4A,#A80F05)] text-white shadow-[0_4px_14px_rgba(0,0,0,.6)] active:scale-95 disabled:opacity-80"
            style={{ transform: `translate(-50%,-50%) rotate(${-rotation}deg)`, transition: "transform 4s cubic-bezier(.14,.86,.22,1)" }}>
            <span className="text-[17px] font-black leading-none tracking-widest">GO</span>
            <span className="mt-0.5 text-[7px] font-bold text-[#FFE9A3]">FREE</span>
          </button>
        </div>
      </div>

      {/* claim button */}
      <div className="px-4 pt-3">
        <button onClick={spin} disabled={phase === "spinning" || phase === "loading"}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[15px] font-black text-white shadow-[0_5px_0_#8c2a05] active:translate-y-0.5 active:shadow-none disabled:opacity-70">
          {phase === "spinning" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={16} />}
          {phase === "spinning" ? T("Spinning…", "ঘুরছে…") : "Spin"}
        </button>
        <p className="mt-1 text-center text-[8.5px] text-white/40">
          {T("One free spin for each successful deposit of ৳500 or more. Every spin awards exactly ৳6; no fee or wager.",
             "৳৫০০ বা তার বেশি প্রতিটি সফল ডিপোজিটে একটি ফ্রি স্পিন। প্রতিটি স্পিনে ঠিক ৳৬; কোনো ফি বা বাজি নেই।")}
        </p>

        {/* leaderboard */}
        <div className="mt-3 rounded-xl border border-[#FFD75E]/25 bg-black/45 p-2.5">
          <p className="text-[9.5px] font-black uppercase tracking-wider text-[#FFD75E]">{T("Winner board", "বিজয়ী তালিকা")}</p>
          <div className="mt-1 space-y-0.5">
            {(state?.recent ?? []).slice(0, 5).map((r, i) => (
              <div key={`${r.who}-${i}`} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-white/70">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[7.5px] font-black ${i === 0 ? "bg-[#FFD75E] text-[#4a2b00]" : "bg-white/10 text-white/60"}`}>{i + 1}</span>
                  {r.who}
                </span>
                <span className="text-[10px] font-black tabular-nums text-[#FFD75E]">৳{(r.amount_cents / 100).toFixed(2)}</span>
              </div>
            ))}
            {!state?.recent?.length && <p className="py-2 text-center text-[9px] text-white/30">{T("No wins yet", "এখনো কোনো জয় নেই")}</p>}
          </div>
        </div>

      </div>

      {/* result */}
      {phase === "won" && result && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/88 px-6 text-center backdrop-blur-sm">
          <Sparkles size={26} className="text-[#FFD75E]" />
          <p className="mt-1 text-[12px] font-black text-white">{T("You won", "আপনি জিতেছেন")}</p>
          <p className="gold-text text-[36px] font-black leading-none tabular-nums">
            {formatTaka(600)}
          </p>
          <p className="mt-2 max-w-[300px] text-[9.5px] leading-snug text-white/55">
            {T("Exactly ৳6 credited as bonus. No spin fee or wager was taken.", "ঠিক ৳৬ বোনাস হিসেবে যোগ হয়েছে। কোনো স্পিন ফি বা বাজি কাটা হয়নি।")}
          </p>
          <p className="mt-1 text-[9px] text-white/35">{T("Balance", "ব্যালেন্স")} {formatTaka(state?.balance_cents ?? 0)}</p>
          <button onClick={() => { setResult(null); setPhase("ready"); }}
            className="mt-4 h-11 w-52 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[13px] font-black text-white shadow-[0_4px_0_#8c2a05] active:translate-y-0.5 active:shadow-none">
            {T("Spin again", "আবার স্পিন")}
          </button>
          <Link href="/prizes" prefetch className="mt-2 h-10 w-52 rounded-full border border-white/20 text-[12px] font-black leading-10 text-white/70">
            {T("Done", "ঠিক আছে")}
          </Link>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center px-4" onClick={() => setToast(null)}>
          <p className="rounded-xl border border-[#FFD75E]/40 bg-black/90 px-3 py-2 text-center text-[10.5px] font-bold text-[#FFE9A3]">{toast}</p>
        </div>
      )}
    </div>
  );
}
