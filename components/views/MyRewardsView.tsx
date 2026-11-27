"use client";
/**
 * আমার পুরস্কার — the rewards hub from the 499bet /m/reward reference.
 *
 * Layout mirrors the reference: a profile/balance card on top (id, balance,
 * VIP level, progress), then three big action tiles —
 *   দাবি করা (claim)          → the reward centre: login prize + egg smash
 *   উদ্ধার তহবিল (rescue fund) → real bonus credits, itemised
 *   বন্ধুদের আমন্ত্রণ জানান     → the invite screen
 *
 * Nothing here is decorative: the "claim" counter is the number of prizes that
 * are genuinely unclaimed right now, the rescue fund total is the sum of the
 * player's real BONUS ledger credits, and the VIP bar is real wagering.
 */
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/lang";
import { formatTaka } from "@/lib/format";
import { ChevronLeft, Gift, Coins, UserRoundPlus, Crown, Copy, Check, RefreshCw, ChevronRight } from "lucide-react";

type Wallet = { balance_cents: number; bonus_cents: number; bonus_count: number; turnover_cents: number };
type Badges = { spin: number; rewards: number; missions: number; rebate: number };

export default function MyRewardsView({
  user, showToast, onBack, goRewards, goInvite, goVip, refreshUser,
}: {
  user: { id: number; balance_cents: number; vip_level: number; phone: string | null; username_or_phone: string };
  showToast: (m: string) => void;
  onBack: () => void;
  goRewards: () => void;
  goInvite: () => void;
  goVip: () => void;
  refreshUser: () => Promise<any>;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [badges, setBadges] = useState<Badges>({ spin: 0, rewards: 0, missions: 0, rebate: 0 });
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([
      fetch("/api/member/badges", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/cashier/summary", { cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]);
    if (b?.ok) setBadges({ spin: Number(b.spin) || 0, rewards: Number(b.rewards) || 0, missions: Number(b.missions) || 0, rebate: Number(b.rebate) || 0 });
    if (c?.ok) setWallet({
      balance_cents: Number(c.balance_cents ?? 0),
      bonus_cents: Number(c.bonus_cents ?? 0),
      bonus_count: Number(c.bonus_count ?? 0),
      turnover_cents: Number(c.turnover_cents ?? 0),
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const claimCount = badges.rewards + badges.missions + badges.rebate;
  const idNo = String(1000000000 + user.id);
  const nextVipAt = (user.vip_level + 1) * 100000;
  // VIP advances on wagering, so the bar must follow lifetime turnover — never the balance
  const wagered = wallet?.turnover_cents ?? 0;
  const vipPct = Math.min(100, Math.round((wagered / Math.max(1, nextVipAt)) * 100));

  async function copyId() {
    try { await navigator.clipboard.writeText(idNo); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { showToast(T("Copy failed", "কপি করা যায়নি")); }
  }

  return (
    <div className="px-3 pt-3 pb-6">
      {/* header */}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} aria-label={T("Back", "ফিরে যান")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-[15px] font-black text-white">{T("My rewards", "আমার পুরস্কার")}</h1>
      </div>

      {/* ── profile card, light like the reference ── */}
      <div className="relative overflow-hidden rounded-2xl border border-black/20 bg-gradient-to-br from-[#f4f6f9] via-[#e6ebf2] to-[#d3dae4] p-3.5 text-[#1c1c1c] shadow-[0_16px_36px_rgba(0,0,0,.45)]">
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border-[16px] border-[#c9b98a]/35" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-gradient-to-br from-[#4a4a4a] to-[#141414] shadow">
            <UserRoundPlus size={30} className="text-[#e8e4d6]" strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <button onClick={copyId} className="flex items-center gap-1.5 text-left" aria-label={T("Copy player ID", "প্লেয়ার আইডি কপি করুন")}>
              <span className="text-[16px] font-black leading-none tabular-nums tracking-tight">{idNo}</span>
              {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={12} className="text-black/40" />}
            </button>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[24px] font-black leading-none tabular-nums">৳ {formatTaka(user.balance_cents, false)}</p>
              <button onClick={async () => { setRefreshing(true); await refreshUser(); await load(); setRefreshing(false); }}
                disabled={refreshing} aria-label={T("Refresh", "রিফ্রেশ")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-black/45 active:scale-90">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between border-t border-black/10 pt-2.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#b9b09a] bg-gradient-to-b from-[#efece1] to-[#c9c3b2] px-2 py-0.5 text-[10px] font-black text-[#4a463a]">
            <Crown size={10} strokeWidth={2.5} />VIP{user.vip_level}
          </span>
          <button onClick={goVip} className="inline-flex items-center gap-1 text-[10px] font-black text-[#8a6500]">
            {T("Benefits", "সুবিধা")}<ChevronRight size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="relative mt-1.5 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/15">
            <div className="h-full rounded-full bg-gradient-to-r from-[#c98f00] to-[#f5b800]" style={{ width: `${vipPct}%` }} />
          </div>
          <span className="text-[9px] font-black tabular-nums text-black/50">
            {formatTaka(wagered, false)} / {formatTaka(nextVipAt / 100, false)}
          </span>
        </div>
      </div>

      {/* ── three action tiles ── */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button onClick={goRewards}
          className="relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl bg-[linear-gradient(150deg,#3fd07a,#1fa85e)] px-2 py-4 text-white shadow-[0_10px_24px_rgba(31,168,94,.35)] active:scale-[.98]">
          <span aria-hidden className="pointer-events-none absolute -left-6 -bottom-6 h-20 w-20 rounded-full bg-white/10" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#1fa85e] shadow">
            <Gift size={24} strokeWidth={2.2} />
            {badges.rewards > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-[#e23b3b] px-1 text-[9px] font-black leading-none text-white">
                {badges.rewards > 9 ? "9+" : badges.rewards}
              </span>
            )}
          </span>
          <span className="relative text-[12px] font-black">{T("Claim", "দাবি করা")}</span>
        </button>

        <button onClick={goRewards}
          className="relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl bg-[linear-gradient(150deg,#ffc247,#f59a12)] px-2 py-4 text-white shadow-[0_10px_24px_rgba(245,154,18,.35)] active:scale-[.98]">
          <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/15" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#f59a12] shadow">
            <Coins size={24} strokeWidth={2.2} />
          </span>
          <span className="relative text-[12px] font-black">{T("Rescue fund", "উদ্ধার তহবিল")}</span>
        </button>

        <button onClick={goInvite}
          className="relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl bg-[linear-gradient(150deg,#f2637f,#e0344f)] px-2 py-4 text-white shadow-[0_10px_24px_rgba(224,52,79,.35)] active:scale-[.98]">
          <span aria-hidden className="pointer-events-none absolute -left-5 -top-5 h-16 w-16 rounded-full bg-white/15" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#e0344f] shadow">
            <UserRoundPlus size={24} strokeWidth={2.2} />
          </span>
          <span className="relative text-center text-[12px] font-black leading-tight">{T("Invite friends", "বন্ধুদের আমন্ত্রণ জানান")}</span>
        </button>

        {/* the fourth cell keeps the grid honest: real bonus balance so far */}
        <div className="flex flex-col justify-center gap-1 rounded-2xl border border-white/10 bg-[#1c1c1c] px-3 py-4">
          <p className="text-[8.5px] font-black uppercase tracking-widest text-white/40">{T("Bonus credited", "বোনাস ক্রেডিট")}</p>
          <p className="text-[18px] font-black leading-none tabular-nums text-[#F5B800]">
            ৳ {formatTaka(wallet?.bonus_cents ?? 0, false)}
          </p>
          <p className="text-[8.5px] text-white/35">
            {wallet?.bonus_count ?? 0} {T("credits", "ক্রেডিট")} · {claimCount} {T("claimable now", "এখন দাবিযোগ্য")}
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[8px] text-white/25">
        {T("Every prize shown is real bonus balance from your own ledger.", "এখানে দেখানো প্রতিটি পুরস্কার আপনার নিজের লেজার থেকে আসা প্রকৃত বোনাস।")}
      </p>
    </div>
  );
}
