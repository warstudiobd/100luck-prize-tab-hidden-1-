"use client";
/**
 * গোল্ডেন এগ + মেইল (v51).
 *
 * Golden Egg plays are free entitlements earned from each successful ৳500+ deposit.
 * Each play is redeemed server-side with no fee or wager and a maximum ৳6 reward.
 *
 * Below the eggs: মেইল — the iPhone-winner list. A physical prize is handed over
 * by the operator, so this list is the record of who won and when, with masked
 * names only.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles, X, Mail } from "lucide-react";
import { useLang } from "../lang";
import { formatTaka, formatTakaCompact as tk } from "@/lib/format";
import { GoldenEgg } from "./PrizeArt";

type Promo = {
  ok?: boolean; logged_in?: boolean; ends_at: string | null; fee_cents: number;
  balance_cents: number; egg_count: number; eggs_used: number[];
  daily_bonus_max_cents: number;
  game_credits?: Record<string, { available: number; used: number }>;
  iphone_winners: Array<{ who: string; created_at: string }>;
  recent: Array<{ who: string; amount_cents: number }>;
};

export default function PrizeEggs() {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [state, setState] = useState<Promo | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [won, setWon] = useState<{ cents: number; egg: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mailWon, setMailWon] = useState<number | null>(null);
  const [left, setLeft] = useState({ h: 0, m: 0, s: 0 });

  const load = useCallback(async () => {
    const r = await fetch("/api/prizes", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setState(r as Promo);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!state?.ends_at) return;
    const target = new Date(state.ends_at).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setLeft({ h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000), s: Math.floor((ms % 60_000) / 1000) });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state?.ends_at]);

  const play = async (game: "egg" | "mail", egg = 1) => {
    if (busy !== null) return;
    setBusy(egg);
    setToast(null);
    try {
      const r = await fetch("/api/prizes/free-play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ game }),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 401) { setToast(T("Log in to play", "খেলতে লগইন করুন")); return; }
      if (!r.ok || !d?.ok) {
        setToast(lang === "bn" ? (d?.error_bn || d?.error || "খেলা যায়নি") : (d?.error || "Could not play"));
        return;
      }
      if (game === "egg") setWon({ cents: Number(d.prize_cents), egg });
      else setMailWon(Number(d.prize_cents));
      await load();
    } catch {
      setToast(T("Network error", "নেটওয়ার্ক সমস্যা"));
    } finally { setBusy(null); }
  };
  const smash = (egg: number) => play("egg", egg);
  const fee = "Free";
  const used = new Set(state?.eggs_used ?? []);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_50%_0%,#6a0d10,#21060a_58%,#121212_100%)] pb-6">
      <div className="flex items-center justify-between px-3 pt-2">
        <Link href="/prizes" prefetch aria-label={T("Back", "পেছনে")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
          <ChevronLeft size={16} />
        </Link>
        <p className="text-[13px] font-black tracking-wide text-[#FFE9A3]">{T("Golden egg", "গোল্ডেন এগ")}</p>
        <Link href="/" prefetch aria-label={T("Close", "বন্ধ")}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
          <X size={15} />
        </Link>
      </div>

      <div className="px-3 pt-1 text-center">
        <p className="text-[11px] font-black leading-snug text-[#FFE9A3]">
          {T("One free egg play per successful ৳500+ deposit", "৳৫০০+ প্রতিটি সফল ডিপোজিটে একটি ফ্রি ডিম খেলা")}
        </p>
        <p className="mt-0.5 text-[9px] leading-snug text-white/50">
          {T("No fee or wager · maximum reward ৳6", "কোনো ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}
        </p>
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <span className="text-[8.5px] font-bold text-white/40">{T("Time left", "অবশিষ্ট সময়")}</span>
          {[left.h, left.m, left.s].map((v, i) => (
            <span key={i} className="rounded border border-[#FFD75E]/40 bg-black/60 px-1.5 py-0.5 text-[10.5px] font-black tabular-nums text-[#FFE9A3]">{pad(v)}</span>
          ))}
          <span className="text-[8.5px] text-white/35">· {used.size}/{state?.egg_count ?? 9}</span>
        </div>
      </div>

      {/* 3×3 eggs */}
      <div className="mx-3 mt-2 rounded-2xl border border-[#FFD75E]/25 bg-[radial-gradient(circle_at_50%_10%,#4a0b0d,#180506_75%)] p-2">
        <div className="grid grid-cols-3 gap-x-1 gap-y-0.5">
          {Array.from({ length: state?.egg_count ?? 9 }).map((_, i) => {
            const n = i + 1;
            const gone = used.has(n);
            return (
              <button key={n} disabled={Boolean(busy) || gone || !(state?.game_credits?.egg?.available ?? 0)} onClick={() => smash(n)}
                className={`relative flex flex-col items-center justify-center rounded-xl py-1 transition-all ${gone ? "opacity-45" : "active:scale-95"}`}>
                {busy === n && <Loader2 size={18} className="absolute z-10 animate-spin text-[#FFD75E]" />}
                <span className={gone ? "" : "drop-shadow-[0_0_10px_rgba(255,197,61,.45)]"}>
                  <GoldenEgg cracked={gone} size={62} />
                </span>
                <span className="mt-0.5 text-[7.5px] font-black text-white/45">
                  {gone ? T("Smashed", "ভাঙা") : `${T("Egg", "ডিম")} ${n}`}
                </span>
                {!gone && <span className="text-[7px] font-black text-[#FFD75E]/85">{fee}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 pt-2">
        <button onClick={() => smash(1 + Math.floor(Math.random() * (state?.egg_count ?? 9)))} disabled={Boolean(busy) || !(state?.game_credits?.egg?.available ?? 0)}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[15px] font-black text-white shadow-[0_5px_0_#8c2a05] active:translate-y-0.5 active:shadow-none disabled:opacity-70">
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={16} />}
          {T("Play egg", "ডিম খেলুন")}
        </button>
        <p className="mt-1 text-center text-[8.5px] text-white/40">
          {T(`${state?.game_credits?.egg?.available ?? 0} free plays ready · each reward is capped at ৳6`,
             `${state?.game_credits?.egg?.available ?? 0}টি ফ্রি খেলা প্রস্তুত · প্রতিটি পুরস্কার সর্বোচ্চ ৳৬`)}
        </p>

        {/* mail — physical prize winners */}
        <div id="mail" className="mt-3 rounded-2xl border border-[#FFD75E]/25 bg-black/45 p-2.5">
          <p className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-[#FFD75E]">
            <Mail size={11} />{T("Prize mail", "প্রাইজ মেইল")}
          </p>
          <p className="mt-1 text-[8.5px] text-white/45">{T("One free play per successful ৳500+ deposit · no fee or wager · maximum reward ৳6", "৳৫০০+ প্রতিটি সফল ডিপোজিটে একটি ফ্রি খেলা · ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}</p>
          <button onClick={() => play("mail")} disabled={Boolean(busy) || !(state?.game_credits?.mail?.available ?? 0)}
            className="mt-2 h-9 w-full rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[11px] font-black text-white disabled:opacity-45">
            {T(`Play · ${state?.game_credits?.mail?.available ?? 0} ready`, `খেলুন · ${state?.game_credits?.mail?.available ?? 0}টি প্রস্তুত`)}
          </button>
          {(state?.iphone_winners ?? []).length === 0 && (
            <p className="py-2 text-center text-[9px] leading-snug text-white/30">
              {T("No iPhone has been won yet. The first win appears here with the winner's masked name.",
                 "এখনো কেউ আইফোন জিতেনি। প্রথম জয়ের পর বিজয়ীর নাম (আংশিক গোপন) এখানে দেখা যাবে।")}
            </p>
          )}
          <div className="mt-1 space-y-0.5">
            {(state?.iphone_winners ?? []).map((w, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                <span className="text-[10px] tabular-nums text-white/70">{w.who}</span>
                <span className="text-[9px] font-black text-[#FFD75E]">iPhone Duo</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[8px] leading-snug text-white/35">
            {T("A physical prize is handed over by the operator on your registered number — no cash is credited for it.",
               "শারীরিক পুরস্কার অপারেটর আপনার নিবন্ধিত নম্বরে হস্তান্তর করেন — এর জন্য নগদ টাকা যোগ হয় না।")}
          </p>
        </div>

        {/* bonus winners */}
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[.03] p-2.5">
          <p className="text-[9.5px] font-black text-white/60">{T("Recent bonus wins", "সাম্প্রতিক বোনাস জয়")}</p>
          <div className="mt-1 space-y-0.5">
            {(state?.recent ?? []).slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                <span className="text-[10px] tabular-nums text-white/65">{r.who}</span>
                <span className="text-[10px] font-black tabular-nums text-[#FFD75E]">৳{(r.amount_cents / 100).toFixed(2)}</span>
              </div>
            ))}
            {!state?.recent?.length && <p className="py-1 text-center text-[9px] text-white/30">{T("No wins yet", "এখনো কোনো জয় নেই")}</p>}
          </div>
        </div>
      </div>

      {mailWon !== null && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 px-6 text-center backdrop-blur-sm">
          <Mail size={38} className="text-[#FFD75E]" />
          <p className="mt-2 text-[12px] font-black text-white">{T("Prize mail reward", "প্রাইজ মেইল পুরস্কার")}</p>
          <p className="gold-text text-[36px] font-black leading-none tabular-nums">{formatTaka(mailWon)}</p>
          <p className="mt-1 text-[9px] text-white/45">{T("Free play · no fee or wager · maximum reward ৳6", "ফ্রি খেলা · কোনো ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}</p>
          <button onClick={() => setMailWon(null)} className="mt-4 h-10 w-44 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[12.5px] font-black text-white">{T("Continue", "চালিয়ে যান")}</button>
        </div>
      )}
      {won && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 px-6 text-center backdrop-blur-sm">
          <div className="animate-[jackpotPop_.5s_ease-out]"><GoldenEgg cracked size={92} /></div>
          <p className="mt-2 text-[11px] font-black text-white/70">{T(`Egg ${won.egg} cracked`, `ডিম ${won.egg} ভেঙেছে`)}</p>
          <p className="gold-text text-[34px] font-black leading-none tabular-nums">{formatTaka(won.cents)}</p>
          <p className="mt-1 text-[9px] text-white/45">{T("Free play · no fee or wager · maximum reward ৳6", "ফ্রি খেলা · কোনো ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}</p>
          <button onClick={() => setWon(null)} className="mt-4 h-10 w-44 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[12.5px] font-black text-white">
            {T("Continue", "চালিয়ে যান")}
          </button>
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
