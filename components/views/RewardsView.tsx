"use client";
/**
 * পুরস্কার — daily reward center (499bet "পুরস্কার" screen).
 *
 * Three chips: 🎁 daily login bonus · 🥚 daily egg smash · 🎡 lucky spin.
 * Below: the countdown to the next Asia/Dhaka midnight, the selected game, the
 * claim button, and the real recent-winners list.
 *
 * Honesty rules this screen follows:
 *   • the prize is decided server-side; the reveal is cosmetic
 *   • "লগইন পুরস্কার" only pays on a genuine daily claim — the reward centres on
 *     one real action per day, it is not a login tracker that invents streaks
 *   • the daily maximum shown is the platform setting (৳99,999 default), never a
 *     number we cannot honour
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Crown, Loader2, Sparkles, Trophy, X } from "lucide-react";
import { useLang } from "../lang";
import { formatTaka } from "@/lib/format";

type Recent = { who: string; amount_cents: number; created_at: string };
type Gate = {
  ok: boolean; enabled: boolean;
  depositCents: number; wagerCents: number;
  requiredDepositCents: number; requiredWagerCents: number;
  depositMet: boolean; wagerMet: boolean;
  reason: "ok" | "no_deposit" | "wager_short";
};
type State = {
  can_login: boolean; can_egg: boolean; ends_at: string | null;
  claimed_login?: boolean; claimed_egg?: boolean;
  gate?: Gate;
  daily_login_max_prize_cents: number; egg_count: number; recent: Recent[];
  /** v36: eggs are ৳2.99 paid plays; the login bonus stays free. */
  fee_cents?: number; balance_cents?: number;
};

const EGG_POS = [
  "col-start-2 row-start-1", "col-start-1 row-start-2", "col-start-2 row-start-2", "col-start-3 row-start-2",
  "col-start-1 row-start-3", "col-start-2 row-start-3", "col-start-3 row-start-3",
  "col-start-1 row-start-4", "col-start-3 row-start-4",
];

export default function RewardsView({ showToast, refreshUser, onOpenSpin, onClose }: {
  showToast: (m: string) => void;
  refreshUser: () => Promise<any>;
  onOpenSpin: () => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [state, setState] = useState<State | null>(null);
  const [mode, setMode] = useState<"login" | "egg">("login");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ cents: number; egg: number | null } | null>(null);
  const [smashed, setSmashed] = useState<number[]>([]);
  const [left, setLeft] = useState<{ h: number; m: number; s: number }>({ h: 0, m: 0, s: 0 });

  const load = useCallback(async () => {
    const r = await fetch("/api/rewards", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) {
      setState(r);
      if (r.can_egg && !r.can_login) setMode("egg");
      if (!r.can_egg && r.can_login) setMode("login");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* countdown to the next Asia/Dhaka midnight (server-supplied instant) */
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

  // v36: the deposit/wager gate is gone. Only the free daily login can be "used";
  // eggs are paid plays, so they can be smashed again and again.
  const claimedToday = mode === "login" ? Boolean(state?.claimed_login) : false;
  /** ৳2.99 per egg — the price the server actually charges. */
  const feeCents = state?.fee_cents ?? 299;
  const feeLabel = `৳${(feeCents / 100).toFixed(2)}`;
  const balanceCents = state?.balance_cents ?? 0;
  const shortOfFee = mode === "egg" && balanceCents < feeCents;
  const pad = (n: number) => String(n).padStart(2, "0");

  async function claim(eggIndex?: number) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/rewards", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "egg" ? { kind: "egg", egg: eggIndex } : { kind: "login" }),
      }).then(r => r.json()).catch(() => null);
      if (!r?.ok) {
        if (r?.code === "already_claimed") await load();
        return showToast(r?.error || T("Could not claim", "দাবি করা যায়নি"));
      }
      if (mode === "egg" && eggIndex) setSmashed(Array.from(new Set([...smashed, eggIndex])));
      setResult({ cents: Number(r.prize_cents), egg: r.egg ?? null });
      await refreshUser();
      await load();
    } finally { setBusy(false); }
  }

  const headline = useMemo(() => {
    if (mode === "login") return T(`Daily login bonus · top prize ৳${((state?.daily_login_max_prize_cents ?? 0) / 100).toLocaleString("en-IN")}`, `প্রতিদিন লগইন বোনাস · সর্বোচ্চ পুরস্কার ৳${((state?.daily_login_max_prize_cents ?? 0) / 100).toLocaleString("bn-BD")}`);
    return T(`Smash an egg — ${feeLabel} per egg, up to ৳150`, `ডিম ভাঙুন — প্রতি ডিম ${feeLabel}, সর্বোচ্চ ৳১৫০`);
  }, [mode, state?.daily_login_max_prize_cents, lang]);

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/80 p-2 backdrop-blur-sm">
      <div className="relative my-2 w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#F5B800]/30 bg-[#12100c] shadow-2xl">
        {/* crown header */}
        <div className="relative bg-gradient-to-b from-[#4a1d10] via-[#2a1208] to-[#12100c] px-3 pb-2 pt-3">
          <button onClick={onClose} aria-label={T("Close", "বন্ধ")}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/70 bg-black/50 text-white active:scale-90">
            <X size={16} />
          </button>
          <div className="flex items-center justify-center gap-1 text-[#F5B800]">
            <Crown size={16} />
            <span className="text-[15px] font-black tracking-wide drop-shadow">{T("Prizes", "পুরস্কার")}</span>
            <Crown size={16} />
          </div>
          <div className="mt-1 flex items-center justify-center gap-2">
            {[
              { key: "login" as const, icon: "🎁", label: T("Login", "লগইন") },
              { key: "egg" as const, icon: "🥚", label: T("Eggs", "ডিম") },
            ].map(c => {
              const on = mode === c.key;
              const open = c.key === "login" ? Boolean(state?.can_login) : !shortOfFee;
              return (
                <button key={c.key} onClick={() => setMode(c.key)}
                  className={`relative flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[11px] font-black transition-all ${on ? "border-[#F5B800] bg-[#F5B800]/20 text-[#F5B800]" : "border-white/15 text-white/60"}`}>
                  <span className="text-[14px]">{c.icon}</span>{c.label}
                  {open && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />}
                </button>
              );
            })}
            <button onClick={onOpenSpin}
              className="flex items-center gap-1 rounded-full border-2 border-white/15 px-2.5 py-1 text-[11px] font-black text-white/60">
              <span className="text-[14px]">🎡</span>{T("Spin", "স্পিন")}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] font-bold leading-snug text-[#F5B800]/90">{headline}</p>
        </div>

        {/* countdown */}
        <div className="flex items-center justify-center gap-1.5 border-b border-white/10 bg-black/40 px-3 py-1.5">
          <span className="text-[9px] font-bold text-white/45">{T("Time left", "অবশিষ্ট সময়")}</span>
          {[T("hours", "ঘণ্টা"), T("min", "মিনিট"), T("sec", "সেকেন্ড")].map((u, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">
                {pad(i === 0 ? left.h : i === 1 ? left.m : left.s)}
              </span>
              <span className="text-[8px] text-white/35">{u}</span>
            </span>
          ))}
        </div>

        {/* game area */}
        <div className="px-3 py-3">
          {mode === "login" ? (
            <div className="relative overflow-hidden rounded-2xl border border-[#F5B800]/25 bg-[radial-gradient(circle_at_50%_20%,#5a2b12,#1a1208_70%)] px-3 py-5">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-b from-[#ff6a4a] to-[#d92f1f] shadow-[0_10px_30px_rgba(217,47,31,.45)]">
                <span className="text-[44px]">🎁</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-lg border border-[#F5B800]/25 bg-black/35 px-1 py-1.5 text-center">
                    <p className="text-[7.5px] font-bold text-white/40">{T("Day", "দিন")} {i + 1}</p>
                    <p className="text-[10.5px] font-black text-[#F5B800]">৳{[2, 5, 10][i]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[8.5px] leading-snug text-white/40">
                {T("One claim per day. The prize is chosen on our server and credited instantly to your balance.",
                  "দিনে একবার দাবি করুন। পুরস্কার আমাদের সার্ভারে নির্ধারিত হয় এবং সাথে সাথে ব্যালেন্সে যোগ হয়।")}
              </p>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-[#F5B800]/25 bg-[radial-gradient(circle_at_50%_30%,#123,#0b0b14_70%)] px-3 py-3">
              <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                {Array.from({ length: state?.egg_count ?? 9 }).map((_, i) => {
                  const n = i + 1;
                  const done = smashed.includes(n);
                  return (
                    <button key={n} disabled={busy || done} onClick={() => claim(n)}
                      className={`relative flex h-[86px] flex-col items-center justify-center rounded-xl border transition-all ${done ? "border-white/8 opacity-35" : "border-[#F5B800]/25 bg-white/[.04] active:scale-95"}`}>
                      <span className="text-[34px] leading-none drop-shadow-[0_0_10px_rgba(245,184,0,.35)]">{done ? "🥚" : "🥚"}</span>
                      <span className="mt-0.5 text-[7.5px] font-bold text-white/35">{done ? T("Smashed", "ভাঙা") : `${T("Egg", "ডিম")} ${n}`}</span>
                      {!done && <span className="text-[7px] font-black text-[#F5B800]/80">{feeLabel}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* v36: no gate panel — the price is shown on the eggs and the button */}
          {mode === "egg" && (
            <p className="mt-2 rounded-xl border border-[#F5B800]/25 bg-[#F5B800]/[.06] px-2.5 py-1.5 text-[9px] leading-snug text-white/60">
              {T(`Each egg costs ${feeLabel} from your balance and pays a prize up to ৳150, credited instantly. Balance: ৳${(balanceCents / 100).toFixed(2)}.`,
                 `প্রতিটি ডিমের মূল্য ${feeLabel} — ব্যালেন্স থেকে কাটা হবে, পুরস্কার সর্বোচ্চ ৳১৫০, সাথে সাথে যোগ হবে। ব্যালেন্স: ৳${(balanceCents / 100).toFixed(2)}।`)}
            </p>
          )}

          {/* claim */}
          <button onClick={() => (mode === "egg" ? claim(1 + Math.floor(Math.random() * (state?.egg_count ?? 9))) : claim())}
            disabled={busy || claimedToday || shortOfFee}
            className="mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffe27a] to-[#e0a400] text-[15px] font-black text-[#3a2400] shadow-[0_6px_18px_rgba(224,164,0,.35)] disabled:opacity-45 active:scale-[.99]">
            {busy ? <Loader2 size={17} className="animate-spin" /> : null}
            {mode === "egg"
              ? (shortOfFee ? T(`Balance too low — need ${feeLabel}`, `ব্যালেন্স কম — ${feeLabel} দরকার`) : T(`Smash an egg — ${feeLabel}`, `ডিম ভাঙুন — ${feeLabel}`))
              : claimedToday ? T("Claimed today", "আজ দাবি সম্পন্ন")
              : T("Claim free", "ফ্রি নিন")}
          </button>

          {/* recent winners */}
          <div className="mt-3 rounded-xl border border-[#F5B800]/20 bg-black/40 px-2.5 py-2">
            <p className="mb-1 flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-[#F5B800]">
              <Trophy size={11} />{T("Recent winners", "সাম্প্রতিক বিজয়ী")}
            </p>
            {(state?.recent ?? []).length === 0 && <p className="py-2 text-center text-[9px] text-white/30">{T("No wins yet", "এখনো কোনো জয় নেই")}</p>}
            <div className="space-y-1">
              {(state?.recent ?? []).map((r, i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                  <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-white/70">
                    <span className="text-[8px] font-black text-[#F5B800]">#{i + 1}</span>{r.who}
                  </span>
                  <span className="text-[10px] font-black tabular-nums text-[#F5B800]">{formatTaka(r.amount_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* result overlay */}
        {result && (
          <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 px-6 text-center backdrop-blur-sm">
            <Sparkles size={26} className="text-[#F5B800]" />
            <p className="mt-1 text-[12px] font-black text-white">{T("You won", "আপনি জিতেছেন")}</p>
            <p className="gold-text text-[36px] font-black leading-none tabular-nums">{formatTaka(result.cents)}</p>
            <p className="mt-1 text-[9px] text-white/45">
              {result.egg
                ? T(`${feeLabel} play fee charged · credited to your balance as bonus`, `${feeLabel} প্লে ফি কাটা হয়েছে · বোনাস হিসেবে ব্যালেন্সে যোগ হয়েছে`)
                : T("credited to your balance as bonus", "বোনাস হিসেবে ব্যালেন্সে যোগ হয়েছে")}
            </p>
            <button onClick={() => setResult(null)} className="gold-btn mt-4 h-10 w-40 rounded-xl text-[12px]">{T("Continue", "চালিয়ে যান")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
