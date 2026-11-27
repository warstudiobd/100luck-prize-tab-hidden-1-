"use client";
/**
 * VIP — the 499bet "নিয়ম / VIP" screen, rebuilt on real numbers.
 *
 *   VIP badge + "আপগ্রেড করুন" prompt
 *   ৩০ দিনের summary   — মাসিক বাজি / মাসিক জমা against the current tier's targets
 *   বেতন (weekly chest) — amount, countdown to next Sunday, ৭ দিন / ৩০ দিন toggle
 *   লেভেল আপ প্রয়োজনীয়তা — the whole ladder with the player's standing
 *
 * Unlike the reference screenshot (which shows a gift-box illustration), every
 * bar here is driven by the player's real approved deposits and real turnover
 * over a rolling 30-day window. The level is derived server-side, never stored,
 * so it demotes automatically after a quiet month — no stale VIP badges.
 */
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/lang";
import { formatTaka } from "@/lib/format";
import { ChevronLeft, Crown, Lock, Gift, Clock, ArrowUpRight, Check } from "lucide-react";

type Tier = {
  level: number; min_deposit_cents: number; min_wager_cents: number;
  weekly_chest_cents: number; title_bn: string; title_en: string;
  reached: boolean; deposit_pct: number; wager_pct: number;
};
type Data = {
  ok: boolean; unlocked: boolean; unlock_cents: number; lifetime_deposit_cents: number;
  level: number; title_bn: string; title_en: string;
  month: { deposit_cents: number; wager_cents: number; window_days: number };
  next: null | { level: number; deposit_cents: number; wager_cents: number; deposit_short_cents: number; wager_short_cents: number };
  tiers: Tier[];
  weekly: {
    week_start: string | null; level: number; amount_cents: number;
    can_claim: boolean; claimed_at: string | null; claimed_amount_cents: number;
    history: Array<{ week_start: string; level: number; amount_cents: number; claimed_at: string }>;
  };
};

export default function VipView({ showToast, onBack, refreshUser }: {
  showToast: (m: string) => void; onBack: () => void; refreshUser: () => Promise<any>;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<"7" | "30">("7");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const r = await fetch("/api/vip", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setData(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  /** Next Sunday 00:00 Asia/Dhaka — the chest resets then. */
  function nextReset(): string {
    const dhaka = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
    const days = (7 - dhaka.getDay()) % 7 || 7;
    dhaka.setDate(dhaka.getDate() + days);
    dhaka.setHours(0, 0, 0, 0);
    const ms = dhaka.getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${d} ${T("d", "দিন")} ${String(h).padStart(2, "0")} : ${String(m).padStart(2, "0")} : ${String(sec).padStart(2, "0")}`;
  }

  async function claim() {
    if (busy || !data?.weekly.can_claim) return;
    setBusy(true);
    try {
      const r = await fetch("/api/vip", { method: "POST" }).then(r => r.json());
      if (!r.ok) { showToast(r.error_bn && lang === "bn" ? r.error_bn : (r.error || T("Could not claim", "দাবি করা যায়নি"))); return; }
      if (r.claimed) { showToast(T(`✅ ${formatTaka(r.paid_cents)} weekly chest credited`, `✅ ${formatTaka(r.paid_cents)} সাপ্তাহিক পুরস্কার যোগ হয়েছে`)); await refreshUser(); }
      else showToast(T("Already claimed this week", "এই সপ্তাহে ইতিমধ্যে নেওয়া হয়েছে"));
      await load();
    } catch { showToast(T("Network error — try again", "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন")); }
    finally { setBusy(false); }
  }

  const tier = data ? data.tiers.find(t => t.level === data.level) ?? null : null;
  const next = data?.next ?? null;

  return (
    <div className="px-3 pt-3 pb-6">
      {/* header */}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} aria-label={T("Back", "ফিরে যান")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-[15px] font-black text-white">{T("VIP rules", "নিয়ম")}</h1>
      </div>

      {loading && <p className="py-10 text-center text-[10px] text-white/35">{T("Loading…", "লোড হচ্ছে…")}</p>}

      {!loading && data && (
        <div className="space-y-3">
          {/* ── badge / upgrade ── */}
          <div className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-r from-[#2a2a2a] to-[#141414] p-3">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${data.level > 0 ? "border-[#F5B800] bg-[#F5B800]/15 text-[#F5B800]" : "border-white/20 bg-white/5 text-white/40"}`}>
              {data.level > 0 ? <Crown size={26} strokeWidth={1.9} /> : <Lock size={24} strokeWidth={1.9} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-black leading-none text-white">
                {data.level > 0 ? `VIP${data.level}` : T("Not VIP yet", "এখনো VIP নয়")}
              </p>
              <p className="mt-0.5 text-[9.5px] font-bold text-white/50">
                {data.level > 0
                  ? T(data.title_en, data.title_bn)
                  : T(`Deposit ৳${formatTaka(data.unlock_cents, false)} total to unlock`, `মোট ৳${formatTaka(data.unlock_cents, false)} জমা করলেই চালু`)}
              </p>
            </div>
            {data.level === 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[8px] text-white/40">{T("Deposited", "জমা হয়েছে")}</p>
                <p className="text-[11px] font-black tabular-nums text-[#F5B800]">{formatTaka(data.lifetime_deposit_cents)}</p>
              </div>
            )}
            {next && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-[#F5B800]/40 bg-[#F5B800]/10 px-2 py-1 text-[9px] font-black text-[#F5B800]">
                {T("Upgrade", "আপগ্রেড")}<ArrowUpRight size={10} strokeWidth={3} />
              </span>
            )}
          </div>

          {/* ── 30-day requirement summary (মাসিক বাজি / মাসিক জমা) ── */}
          <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] p-3">
            <p className="text-[11px] font-black text-white">
              {T(`Complete every ${data.month.window_days}-day requirement`, `${data.month.window_days} দিনের সব শর্ত পূরণ করুন`)}
            </p>
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between text-[9.5px] font-bold">
                  <span className="text-white/60">{T("Monthly wager", "মাসিক বাজি")}</span>
                  <span className="tabular-nums text-[#F5B800]">
                    ৳ {formatTaka(data.month.wager_cents, false)} <span className="text-white/35">/{formatTaka(tier?.min_wager_cents ?? next?.wager_cents ?? 0, false)}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#c98f00] to-[#ffe066]"
                    style={{ width: `${tier ? tier.wager_pct : next && next.wager_cents > 0 ? Math.min(100, (data.month.wager_cents / next.wager_cents) * 100) : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[9.5px] font-bold">
                  <span className="text-white/60">{T("Monthly deposit", "মাসিক জমা")}</span>
                  <span className="tabular-nums text-[#F5B800]">
                    ৳ {formatTaka(data.month.deposit_cents, false)} <span className="text-white/35">/{formatTaka(tier?.min_deposit_cents ?? next?.deposit_cents ?? 0, false)}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#c98f00] to-[#ffe066]"
                    style={{ width: `${tier ? tier.deposit_pct : next && next.deposit_cents > 0 ? Math.min(100, (data.month.deposit_cents / next.deposit_cents) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── বেতন / weekly chest ── */}
          <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[12px] font-black text-white">
                <span className="h-3 w-1 rounded-full bg-[#e23b3b]" />
                {T("Weekly chest", "বেতন")}
              </p>
              <div className="flex items-center gap-1">
                {(["7", "30"] as const).map(k => (
                  <button key={k} onClick={() => setRange(k)}
                    className={`rounded-md px-2 py-0.5 text-[9px] font-black ${range === k ? "bg-[#F5B800] text-[#1a1300]" : "bg-white/8 text-white/50"}`}>
                    {k} {T("days", "দিন")}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-1.5 text-[9.5px] font-bold text-white/55">
              {T("Time until reset", "বাকি আনলক সময়")}: <span className="tabular-nums text-white/80">{nextReset()}</span>
            </p>

            <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 p-2.5">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${data.weekly.can_claim ? "border-[#F5B800]/60 bg-[#F5B800]/15 text-[#F5B800]" : "border-white/12 bg-white/5 text-white/35"}`}>
                <Gift size={24} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black tabular-nums text-white">
                  ৳ {formatTaka(range === "7" ? data.weekly.amount_cents : data.weekly.amount_cents * 4, false)}
                </p>
                <p className="text-[8.5px] leading-snug text-white/45">
                  {data.level > 0
                    ? T(`VIP${data.level} chest · claimed once per week`, `VIP${data.level} বেতন · সপ্তাহে একবার`)
                    : T("Reach VIP 1 to receive a weekly chest", "VIP ১-এ পৌঁছালে সাপ্তাহিক বেতন পাবেন")}
                </p>
              </div>
              <button onClick={claim} disabled={busy || !data.weekly.can_claim}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[9.5px] font-black ${
                  data.weekly.can_claim && !busy
                    ? "bg-gradient-to-b from-[#3fd07a] to-[#22b463] text-white active:scale-95"
                    : "bg-white/8 text-white/35"}`}>
                {busy ? "…" : data.weekly.claimed_at ? T("Claimed", "নেওয়া হয়েছে") : T("Claim", "দাবি")}
              </button>
            </div>

            {data.weekly.history.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.weekly.history.slice(0, 5).map(h => (
                  <div key={h.week_start} className="flex items-center justify-between rounded-lg bg-white/[.03] px-2 py-1 text-[9px]">
                    <span className="flex items-center gap-1 tabular-nums text-white/50"><Clock size={9} />{h.week_start}</span>
                    <span className="font-black tabular-nums text-[#F5B800]">{formatTaka(h.amount_cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── লেভেল আপ প্রয়োজনীয়তা ── */}
          <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-black text-white">
              <span className="h-3 w-1 rounded-full bg-[#e23b3b]" />
              {T("Level-up requirements", "লেভেল আপ প্রয়োজনীয়তা")}
            </p>
            <p className="mt-0.5 text-[8.5px] text-white/40">
              {T(`Both requirements must be met over a rolling ${data.month.window_days} days`, `ঘুরমান ${data.month.window_days} দিনে দুইটি শর্তই পূরণ করতে হবে`)}
            </p>

            <div className="mt-2 space-y-1.5">
              {data.tiers.map(t => (
                <div key={t.level} className={`rounded-xl border p-2 ${t.level === data.level ? "border-[#F5B800]/60 bg-[#F5B800]/[.08]" : t.reached ? "border-emerald-400/30 bg-emerald-400/[.05]" : "border-white/8 bg-black/25"}`}>
                  <div className="flex items-center gap-1.5">
                    <Crown size={11} className={t.reached ? "text-[#F5B800]" : "text-white/30"} />
                    <span className={`text-[10.5px] font-black ${t.reached ? "text-white" : "text-white/55"}`}>
                      VIP{t.level} <span className="font-bold text-white/40">{T(t.title_en, t.title_bn)}</span>
                    </span>
                    {t.level === data.level && <span className="rounded bg-[#F5B800] px-1 text-[7px] font-black text-[#1a1300]">{T("YOU", "আপনি")}</span>}
                    {t.reached && t.level !== data.level && <Check size={10} className="text-emerald-400" />}
                    <span className="ml-auto text-[9px] font-black tabular-nums text-[#F5B800]">{formatTaka(t.weekly_chest_cents)}/wk</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[7.5px] text-white/40">{T("Deposit", "জমা")} {formatTaka(t.min_deposit_cents, false)}</p>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/60">
                        <div className={`h-full rounded-full ${t.reached ? "bg-emerald-400" : "bg-[#F5B800]/70"}`} style={{ width: `${t.deposit_pct}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[7.5px] text-white/40">{T("Wager", "বাজি")} {formatTaka(t.min_wager_cents, false)}</p>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/60">
                        <div className={`h-full rounded-full ${t.reached ? "bg-emerald-400" : "bg-[#4ea8f5]/70"}`} style={{ width: `${t.wager_pct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[8px] text-white/30">
            {T("VIP level is recalculated from your real deposits and wagers every time this screen loads.",
               "প্রতিবার এই স্ক্রিন খুললে আপনার প্রকৃত জমা ও বাজি থেকে VIP লেভেল নতুন করে হিসাব হয়।")}
          </p>
        </div>
      )}
    </div>
  );
}
