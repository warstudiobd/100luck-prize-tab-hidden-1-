"use client";
/**
 * বন্ধুদের আমন্ত্রণ জানান — referral screen, matching the 499bet 4-tab layout:
 *
 *   সংক্ষিপ্ত বর্ণনা — 4 income cards, share box (QR + link + channels), income
 *                    goal with progress, the tier ladder, received-prizes totals,
 *                    and the leaderboard.
 *   আয়             — আজকের আয় / মোট আয় breakdown, every line from real ledger rows.
 *   রেকর্ডস         — one row per paid referral bonus (তারিখ · নাম · পরিমাণ) + মোট.
 *   আমন্ত্রিতদের তালিকা — level card, আজ/গতকাল/মাস, and the invited friends list.
 *
 * Every figure comes from /api/referral/summary. Nothing is estimated, and the
 * screen never states the internal qualification bar.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ChevronLeft, ChevronDown, Copy, Crown, Diamond, Inbox,
  Share2, Trophy, UserPlus, Users,
} from "lucide-react";
import { useLang } from "../lang";
import { formatTaka } from "@/lib/format";

type Tab = "summary" | "income" | "records" | "list";
type Ladder = { referrals: number; bonus_cents: number; reached: boolean; paid: boolean };
type Kind = { key: string; labelBn: string; labelEn: string; cents: number; count: number };
type Rec = { id: string; who: string; referred_id: number | null; amount_cents: number; created_at: string; source: "friend" | "ladder" };
type Summary = {
  level: string; vip_level: number; referral_code: string;
  counts: { referrals: number; qualified: number };
  by_range: { today: number; yesterday: number; month: number };
  income: {
    today_cents: number; yesterday_cents: number; total_cents: number;
    referral_cents: number; referral_count: number; kinds: Kind[];
    wagered_cents: number; deposit_cents: number;
  };
  goals: { income_cents: number; referrals: number };
  ladder: Ladder[];
  recent: { id: number; who: string; joined_at: string }[];
  records: Rec[];
  rules: { bonus_cents: number; effective_from: string };
};

const SHARE = [
  { id: "wa", label: "WhatsApp", bg: "#25D366", icon: "🟢" },
  { id: "tg", label: "Telegram", bg: "#2AABEE", icon: "✈️" },
  { id: "fb", label: "Facebook", bg: "#1877F2", icon: "f" },
  { id: "line", label: "LINE", bg: "#06C755", icon: "L" },
  { id: "x", label: "X", bg: "#111111", icon: "𝕏" },
];

const AVATAR_BG = ["linear-gradient(160deg,#ffd166,#f4a261)", "linear-gradient(160deg,#8ecae6,#219ebc)", "linear-gradient(160deg,#ffb3c1,#fb6f92)"];

export default function InviteView({ showToast, onBack, referralCode }: {
  showToast: (m: string) => void;
  onBack: () => void;
  referralCode: string;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [tab, setTab] = useState<Tab>("summary");
  const [range, setRange] = useState<"today" | "yesterday" | "month">("today");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllLadder, setShowAllLadder] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/referral/summary", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setData(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const link = useMemo(
    () => (typeof window === "undefined" ? "" : `${window.location.origin}/?ref=${referralCode || data?.referral_code || ""}`),
    [referralCode, data?.referral_code]
  );
  const qr = useMemo(() => (link ? `/api/qr?d=${encodeURIComponent(link)}&s=240` : ""), [link]);

  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); showToast(msg); }
    catch { showToast(T("Copy failed — long-press instead", "কপি হয়নি — চেপে ধরে কপি করুন")); }
  };

  async function share(network?: string) {
    const msg = T(`Join 100LUCK with my link: ${link}`, `আমার লিংকে 100LUCK-এ যোগ দিন: ${link}`);
    const urls: Record<string, string> = {
      wa: `https://wa.me/?text=${encodeURIComponent(msg)}`,
      tg: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(T("Join 100LUCK", "100LUCK-এ যোগ দিন"))}`,
      fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link)}`,
      x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(T("Join 100LUCK", "100LUCK-এ যোগ দিন"))}`,
    };
    if (network && urls[network]) {
      window.open(urls[network], "_blank", "noopener,noreferrer");
      return;
    }
    if (navigator.share) { try { await navigator.share({ title: "100LUCK", text: msg, url: link }); return; } catch { /* fall back */ } }
    copy(msg, T("Invite message copied", "আমন্ত্রণ বার্তা কপি হয়েছে"));
  }

  async function claimLadder() {
    setClaiming(true);
    try {
      const r = await fetch("/api/referral/ladder", { method: "POST" }).then(r => r.json()).catch(() => null);
      if (!r?.ok) return showToast(r?.error || T("Could not claim", "দাবি করা যায়নি"));
      if (!r.tiers_paid) return showToast(T("No new tier unlocked yet", "এখনো নতুন কোনো ধাপ খোলেনি"));
      showToast(T(`✅ ${r.tiers_paid} tier(s) credited — ${formatTaka(r.paid_cents)}`, `✅ ${r.tiers_paid}টি ধাপ ক্রেডিট — ${formatTaka(r.paid_cents)}`));
      await load();
    } finally { setClaiming(false); }
  }

  const income = data?.income;
  const dueTiers = (data?.ladder ?? []).filter(l => l.reached && !l.paid);
  const rangeLabel = range === "today" ? T("Today", "আজ") : range === "yesterday" ? T("Yesterday", "গতকাল") : T("This month", "বর্তমান মাস");
  const goalPct = data ? Math.min(100, (data.counts.referrals / Math.max(1, data.goals.referrals)) * 100) : 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "summary", label: T("Overview", "সংক্ষিপ্ত বর্ণনা") },
    { key: "income", label: T("Income", "আয়") },
    { key: "records", label: T("Records", "রেকর্ডস") },
    { key: "list", label: T("Invited", "আমন্ত্রিতদের তালিকা") },
  ];

  const Empty = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center gap-2 py-12">
      <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[.03]">
        <Inbox size={34} className="text-white/25" strokeWidth={1.4} />
        <span className="absolute -right-1 -top-1 text-[13px]">✨</span>
      </span>
      <p className="text-[13px] font-black text-white/55">{T("No data", "কোন ডেটা নেই")}</p>
      <p className="px-6 text-center text-[9.5px] leading-snug text-white/30">{text}</p>
    </div>
  );

  return (
    <div className="pb-[92px]">
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Back", "ফিরে যান")}>
          <ChevronLeft size={19} />
        </button>
        <h1 className="flex-1 text-center text-[15px] font-black tracking-wide text-white">{T("Invite your friends", "বন্ধুদের আমন্ত্রণ জানান")}</h1>
        <button onClick={() => share()} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 active:scale-90" aria-label={T("Share", "শেয়ার")}>
          <Share2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-4 border-b border-white/10">
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative px-1 py-2.5 text-[10.5px] font-bold leading-tight ${on ? "text-[#F5B800]" : "text-white/45"}`}>
              {t.label}
              {on && <span className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-t bg-[#F5B800]" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 px-3 pt-2.5">
        {/* ── সংক্ষিপ্ত বর্ণনা ─────────────────────────────────────── */}
        {tab === "summary" && (
          <>
            <div className="text-center text-[15px] font-black tracking-wide text-white">{T("Leaderboard", "লিডারবোর্ড")}</div>

            {/* 4 income cards */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: T("Today's income", "আজকের আয়"), value: formatTaka(income?.today_cents ?? 0, false), bg: "linear-gradient(120deg,#4ea8f5,#2f7fe0)" },
                { label: T("Yesterday's income", "গতকালের আয়"), value: formatTaka(income?.yesterday_cents ?? 0, false), bg: "linear-gradient(120deg,#8b7bf0,#6d5bd0)" },
                { label: T("Supervisors", "সুপারিশকারী"), value: String(data?.counts.referrals ?? 0), bg: "linear-gradient(120deg,#a78bfa,#8b5cf6)" },
                { label: T("Qualified players", "যোগ্য পরিচায়ক"), value: String(data?.counts.qualified ?? 0), bg: "linear-gradient(120deg,#38bdf8,#0ea5e9)" },
              ].map((c, i) => (
                <div key={i} style={{ backgroundImage: c.bg }} className="rounded-xl px-2.5 py-2 text-center text-white shadow-lg shadow-black/30">
                  <p className="text-[9.5px] font-bold text-white/90">{c.label}</p>
                  <p className="text-[19px] font-black leading-tight tabular-nums">{c.value}</p>
                </div>
              ))}
            </div>

            {/* share box */}
            <div className="card-metal rounded-2xl p-2.5">
              <p className="text-[10px] font-bold text-white/70">{T("Share with your friends", "আপনার বন্ধুদের সাথে ভাগ করুন")}</p>
              <div className="mt-1.5 flex items-start gap-2">
                <div className="shrink-0 rounded-lg bg-white p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {qr ? <img src={qr} alt={T("Invite QR", "আমন্ত্রণ QR")} className="h-[68px] w-[68px]" /> : null}
                  <p className="mt-0.5 text-center text-[6.5px] font-black text-[#1a1300]">{T("Save code", "কোড সংরক্ষণ")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[9px] tabular-nums text-white/70">{link || "—"}</span>
                    <button onClick={() => copy(link, T("Link copied", "লিংক কপি হয়েছে"))} className="shrink-0 rounded bg-[#F5B800] px-1.5 py-0.5 text-[8px] font-black text-black">
                      <Copy size={9} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {SHARE.map(s => (
                      <button key={s.id} onClick={() => share(s.id)} style={{ background: s.bg }}
                        aria-label={s.label}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-black text-white shadow active:scale-90">
                        {s.icon}
                      </button>
                    ))}
                    <span className="ml-1 rounded bg-[#F5B800]/15 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-[#F5B800]">{data?.referral_code || "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* income goal */}
            <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#3f6fd8,#6f5bd0)] p-3">
              <div className="flex items-center gap-2">
                <Trophy size={30} className="text-[#ffd166]" />
                <div className="flex-1 text-center">
                  <p className="text-[13px] font-black text-white">{T("Income goal", "আয়ের লক্ষ্য")}</p>
                  {/* target from platform_settings, progress from this player's real referral income */}
                  <p className="mt-0.5 text-[24px] font-black leading-none tabular-nums text-[#ffd166]">{formatTaka(data?.goals.income_cents ?? 0)}</p>
                  <p className="mt-1 text-[8.5px] text-white/85">
                    {T(`Earned so far ${formatTaka(income?.total_cents ?? 0)}`, `এখন পর্যন্ত আয় ${formatTaka(income?.total_cents ?? 0)}`)}
                  </p>
                  <div className="mx-auto mt-1.5 h-1.5 w-full max-w-[210px] overflow-hidden rounded-full bg-black/35">
                    <div className="h-full rounded-full bg-[#ffd166]" style={{ width: `${Math.min(100, goalPct)}%` }} />
                  </div>
                  <p className="mt-1 text-[8.5px] text-white/80">
                    {T(`Invite ${data?.goals.referrals ?? 0} users to complete the goal`, `${data?.goals.referrals ?? 0} জনকে আমন্ত্রণ জানান লক্ষ্য পূরণের জন্য`)}
                  </p>
                </div>
              </div>
            </div>

            {/* headline rules */}
            <div className="rounded-xl border border-[#F5B800]/30 bg-[#F5B800]/[.06] px-2.5 py-2 text-center">
              <p className="text-[11px] font-black leading-snug text-[#F5B800]">
                {T("Invite 1 friend, earn ৳300.", "১ জনকে আমন্ত্রণ করুন, আয় করুন ৩০০ টাকা।")}
              </p>
              <p className="mt-0.5 text-[9px] text-white/55">{T("Referral bonus is paid once per friend, as real bonus balance.", "প্রতি বন্ধুতে একবার রেফারেল বোনাস, প্রকৃত বোনাস ব্যালেন্স হিসেবে।")}</p>
            </div>

            {/* receiving ladder */}
            {dueTiers.length > 0 && (
              <button onClick={claimLadder} disabled={claiming}
                className="gold-btn h-11 w-full rounded-xl text-[12px]">
                {claiming ? T("Claiming…", "দাবি হচ্ছে…") : T(`Claim ${dueTiers.length} unlocked tier(s) — ${formatTaka(dueTiers.reduce((s, t) => s + t.bonus_cents, 0))}`, `${dueTiers.length}টি ধাপ দাবি করুন — ${formatTaka(dueTiers.reduce((s, t) => s + t.bonus_cents, 0))}`)}
              </button>
            )}

            <div className="card-metal overflow-hidden rounded-2xl">
              <p className="border-b border-white/10 bg-[#3f6fd8] px-2.5 py-1.5 text-center text-[10.5px] font-black text-white">
                {T("Bonus by number of invitees", "বৈধ আমন্ত্রণের ভিত্তিতে বোনাস")}
              </p>
              <div className="grid grid-cols-2 border-b border-white/10 bg-white/[.05] text-[9px] font-black text-white/60">
                <span className="px-2 py-1 text-center">{T("Valid invites", "বৈধ আমন্ত্রণ")}</span>
                <span className="px-2 py-1 text-center">{T("Bonus", "বোনাস")}</span>
              </div>
              {(showAllLadder ? (data?.ladder ?? []) : (data?.ladder ?? []).slice(0, 10)).map(l => (
                <div key={l.referrals} className={`grid grid-cols-2 border-b border-white/5 text-[10px] last:border-0 ${l.paid ? "bg-emerald-400/[.07]" : l.reached ? "bg-[#F5B800]/[.08]" : ""}`}>
                  <span className="px-2 py-1.5 text-center font-black tabular-nums text-white/80">{l.referrals.toLocaleString("en-IN")}</span>
                  <span className={`px-2 py-1.5 text-center font-black tabular-nums ${l.paid ? "text-emerald-400" : l.reached ? "text-[#F5B800]" : "text-white/60"}`}>
                    {formatTaka(l.bonus_cents, false)}
                    {l.paid && <span className="ml-1 text-[7px] font-bold">{T("paid", "পরিশোধিত")}</span>}
                  </span>
                </div>
              ))}
              {(data?.ladder ?? []).length > 10 && (
                <button onClick={() => setShowAllLadder(v => !v)} className="flex w-full items-center justify-center gap-1 py-1.5 text-[9px] font-black text-[#F5B800]">
                  {showAllLadder ? T("Show less", "কম দেখান") : T(`Show all ${data?.ladder.length} tiers`, `সব ${data?.ladder.length}টি ধাপ`)}
                  <ChevronDown size={11} className={showAllLadder ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
              )}
            </div>

            {/* received prizes */}
            <p className="pt-1 text-center text-[13px] font-black text-white">{T("Prizes received", "প্রাপ্ত পুরস্কার")}</p>
            <div className="space-y-1.5">
              {(income?.kinds ?? []).map((k, i) => (
                <div key={k.key} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[.04] px-2.5 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[16px]">{["🎁", "⭐", "🎡", "🥚"][i % 4]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-bold text-white/85">{lang === "bn" ? k.labelBn : k.labelEn}</p>
                    <p className="text-[8.5px] text-white/40">{T(`${k.count} claims`, `${k.count} দাবিকৃত`)}</p>
                  </div>
                  <p className="text-[13px] font-black tabular-nums text-[#F5B800]">{formatTaka(k.cents)}</p>
                </div>
              ))}
            </div>

            {/* leaderboard */}
            <div className="card-metal overflow-hidden rounded-2xl">
              <p className="border-b border-white/10 bg-[linear-gradient(90deg,#1e9cf0,#7b5cf0)] px-2.5 py-1.5 text-center text-[11px] font-black text-white">
                {T("Leaderboard", "লিডারবোর্ড")}
              </p>
              {loading ? (
                <p className="py-6 text-center text-[9.5px] text-white/30">{T("Loading…", "লোড হচ্ছে…")}</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1 px-1 pt-2">
                    {[0, 1, 2].map(i => {
                      const r = data?.recent[i];
                      return (
                        <div key={i} className={`flex flex-col items-center ${i === 1 ? "order-2 -mt-2" : i === 0 ? "order-1 mt-2" : "order-3 mt-2"}`}>
                          <span className="rounded-full bg-white/10 px-1.5 text-[8px] font-black text-[#F5B800]">{i + 1}{T("st", "তম")}</span>
                          <span style={{ backgroundImage: AVATAR_BG[i] }} className={`mt-0.5 flex items-center justify-center rounded-full border-2 border-white/70 ${i === 1 ? "h-14 w-14 text-[22px]" : "h-11 w-11 text-[17px]"}`}>👤</span>
                          <span className="mt-0.5 max-w-full truncate text-[8.5px] tabular-nums text-white/55">{r ? r.who : "—"}</span>
                          <span className="text-[8px] tabular-nums text-white/40">
                            {r ? new Date(r.joined_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "2-digit" }) : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 border-t border-white/8 px-2.5 py-1.5 text-[8px] leading-snug text-white/35">
                    {T("Ranks show invited friends, not invented players. Nobody invited yet → nobody ranked.",
                      "র‍্যাংকিং আমন্ত্রিত বন্ধুদের ভিত্তিতে — কোনো বানানো প্লেয়ার নয়। এখনো কেউ আমন্ত্রিত না হলে তালিকা খালি থাকে।")}
                  </p>
                  {(data?.recent ?? []).slice(0, 5).map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between border-t border-white/5 px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 text-[9.5px] tabular-nums text-white/70">
                        <span className="text-[8px] font-black text-[#F5B800]">#{i + 1}</span>{r.who}
                      </span>
                      <span className="text-[9px] tabular-nums text-white/40">
                        {new Date(r.joined_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </span>
                    </div>
                  ))}
                  {(data?.recent ?? []).length === 0 && <Empty text={T("Nobody has registered with your code yet.", "এখনো কেউ আপনার কোডে রেজিস্টার করেনি।")} />}
                </>
              )}
            </div>
          </>
        )}

        {/* ── আয় ───────────────────────────────────────────────────── */}
        {tab === "income" && (
          <>
            <div className="card-metal rounded-2xl p-2.5">
              <p className="text-center text-[10.5px] font-bold text-white/55">{T("Today's income", "আজকের আয়")}: <span className="font-black text-white">{formatTaka(income?.today_cents ?? 0)}</span></p>
              <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
                {(income?.kinds ?? []).map(k => (
                  <div key={k.key} className="flex items-center justify-between text-[10px]">
                    <span className="text-white/60">{lang === "bn" ? k.labelBn : k.labelEn}</span>
                    <span className={`font-black tabular-nums ${k.cents ? "text-[#F5B800]" : "text-white/40"}`}>{formatTaka(k.cents)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">{T("Wagering rebate", "বেটিং রিবেট")}</span>
                  <span className="font-black tabular-nums text-white/40">{formatTaka(0)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">{T("Deposit bonus", "জমা ছাড়া")}</span>
                  <span className="font-black tabular-nums text-white/40">{formatTaka(income?.deposit_cents ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">{T("Supervisors", "সুপারিশকারী")}</span>
                  <span className="font-black tabular-nums text-white/70">{data?.counts.referrals ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">{T("Qualified players", "যোগ্য পরিচায়ক")}</span>
                  <span className="font-black tabular-nums text-white/70">{data?.counts.qualified ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="card-metal rounded-2xl p-2.5">
              <p className="text-center text-[10.5px] font-bold text-white/55">{T("Total income", "মোট আয়")}: <span className="font-black text-[#F5B800]">{formatTaka(income?.total_cents ?? 0)}</span></p>
              <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
                {(income?.kinds ?? []).map(k => (
                  <div key={k.key} className="flex items-center justify-between text-[10px]">
                    <span className="text-white/60">{lang === "bn" ? k.labelBn : k.labelEn}</span>
                    <span className={`font-black tabular-nums ${k.cents ? "text-[#F5B800]" : "text-white/40"}`}>{formatTaka(k.cents)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/60">{T("Total wagered (qualifying)", "মোট বৈধ বাজি")}</span>
                  <span className="font-black tabular-nums text-white/60">{formatTaka(income?.wagered_cents ?? 0)}</span>
                </div>
              </div>
              <p className="mt-2 rounded-lg border border-[#F5B800]/20 bg-[#F5B800]/[.06] px-2 py-1.5 text-[8.5px] leading-snug text-[#F5B800]/80">
                {T("Every line above is summed from your wallet ledger. A kind you have never earned shows ৳0 — it is not padded.",
                  "উপরের প্রতিটি লাইন আপনার ওয়ালেট লেজার থেকে যোগ করা। যে ধরন আপনি কখনো পাননি সেটি ৳০ দেখায় — বাড়িয়ে দেখানো হয় না।")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(["today", "yesterday", "month"] as const).map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`rounded-lg border px-1 py-1.5 text-[9.5px] font-bold ${range === r ? "border-[#F5B800] bg-[#F5B800]/12 text-[#F5B800]" : "border-white/12 text-white/50"}`}>
                  {r === "today" ? T("Today", "আজ") : r === "yesterday" ? T("Yesterday", "গতকাল") : T("This month", "বর্তমান মাস")}
                  <span className="ml-1 font-black tabular-nums">+{data ? data.by_range[r] : 0}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── রেকর্ডস ───────────────────────────────────────────────── */}
        {tab === "records" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1.5 text-[10px] font-bold text-white/60">
                {T("Invite bonus", "আমন্ত্রণ পুরস্কার")} <ChevronDown size={11} />
              </span>
              <span className="ml-auto rounded-md border border-white/15 px-2 py-1.5 text-[9px] tabular-nums text-white/50">
                {new Date().toLocaleDateString("en-GB", { month: "2-digit", day: "2-digit" })} - {new Date().toLocaleDateString("en-GB", { month: "2-digit", day: "2-digit" })}
              </span>
            </div>
            <div className="card-metal overflow-hidden rounded-2xl">
              <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-white/[.05] px-2 py-1.5 text-[8.5px] font-bold text-white/50">
                <span>{T("Registered", "নিবন্ধনের তারিখ")}</span>
                <span className="text-center">{T("User name", "ব্যবহারকারীর নাম")}</span>
                <span className="text-right">{T("Amount", "পরিমাণ")}</span>
              </div>
              {loading && <p className="py-8 text-center text-[9.5px] text-white/30">{T("Loading…", "লোড হচ্ছে…")}</p>}
              {!loading && (data?.records ?? []).length === 0 && <Empty text={T("No referral bonus has been paid to you yet.", "এখনো কোনো রেফারেল বোনাস পরিশোধিত হয়নি।")} />}
              {(data?.records ?? []).map(r => (
                <div key={r.id} className="grid grid-cols-3 gap-1 border-b border-white/5 px-2 py-2 text-[9.5px] last:border-0">
                  <span className="tabular-nums text-white/55">{new Date(r.created_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                  <span className="text-center tabular-nums text-white/75">
                    {r.source === "ladder"
                      ? T(`Tier ${r.who.replace(" tier", "")}`, `ধাপ ${r.who.replace(" tier", "")}`)
                      : r.who}
                  </span>
                  <span className="text-right font-black tabular-nums text-[#F5B800]">{formatTaka(r.amount_cents, false)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[11px] font-black">
              <span className="text-white/55">{T("Total", "মোট")}</span>
              <span className="tabular-nums text-[#F5B800]">{formatTaka((data?.records ?? []).reduce((a, r) => a + r.amount_cents, 0), false)}</span>
            </div>
          </>
        )}

        {/* ── আমন্ত্রিতদের তালিকা ────────────────────────────────────── */}
        {tab === "list" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="card-metal rounded-2xl p-2.5">
                <div className="flex items-center gap-1.5">
                  <Diamond size={22} className="text-[#5ac8fa]" />
                  <div>
                    <p className="text-[10px] text-white/45">{T("Level", "স্তর")}</p>
                    <p className="text-[13px] font-black text-white">{data?.level ?? "—"}</p>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="flex items-center justify-between text-[9px] text-white/50">
                    <span className="flex items-center gap-1"><UserPlus size={9} />{T("Supervisors", "সুপারিশকারী")}</span>
                    <span className="font-black text-white/85">{data?.counts.referrals ?? 0}</span>
                  </p>
                  <p className="flex items-center justify-between text-[9px] text-white/50">
                    <span className="flex items-center gap-1"><Users size={9} />{T("Qualified", "যোগ্য পরিচায়ক")}</span>
                    <span className="font-black text-white/85">{data?.counts.qualified ?? 0}</span>
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                {(["today", "yesterday", "month"] as const).map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-[9.5px] ${range === r ? "border-[#F5B800] bg-[#F5B800]/12 text-[#F5B800]" : "border-white/10 bg-white/[.03] text-white/55"}`}>
                    <span>{r === "today" ? T("Today", "আজ") : r === "yesterday" ? T("Yesterday", "গতকাল") : T("This month", "বর্তমান মাস")}</span>
                    <span className="font-black tabular-nums">+{data ? data.by_range[r] : 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold text-white/55">{T("All", "সব")} ▾</span>
              <span className="rounded-md border border-[#F5B800]/50 bg-[#F5B800]/10 px-2 py-1 text-[10px] font-bold text-[#F5B800]">{T("Today", "আজ")} {rangeLabel}</span>
            </div>

            <div className="card-metal overflow-hidden rounded-2xl">
              {loading && <p className="py-8 text-center text-[9.5px] text-white/30">{T("Loading…", "লোড হচ্ছে…")}</p>}
              {!loading && (data?.recent ?? []).length === 0 && <Empty text={T("Nobody has registered with your code yet. Share your link to start.", "এখনো কেউ আপনার কোডে রেজিস্টার করেনি। লিংক শেয়ার করে শুরু করুন।")} />}
              {(data?.recent ?? []).map((r, i) => (
                <div key={r.id} className="flex items-center justify-between border-b border-white/5 px-2.5 py-2 last:border-0">
                  <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-white/75">
                    <span className="text-[8px] font-black text-[#F5B800]">#{i + 1}</span>{r.who}
                  </span>
                  <span className="text-[9px] tabular-nums text-white/40">
                    {new Date(r.joined_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#F5B800]/25 bg-[#F5B800]/[.06] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9.5px] font-black text-[#F5B800]"><Crown size={11} />{T("Income goal", "আয়ের লক্ষ্য")}</p>
              <p className="mt-0.5 text-[9px] leading-snug text-white/55">
                {T(`${goalPct.toFixed(1)}% of the ${data?.goals.referrals ?? 0}-invite goal reached`, `${data?.goals.referrals ?? 0} জনের লক্ষ্যের ${goalPct.toFixed(1)}% সম্পন্ন`)}
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-gradient-to-r from-[#4ea8f5] to-[#F5B800]" style={{ width: `${goalPct}%` }} />
              </div>
              <button onClick={() => setTab("summary")} className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-[#F5B800]/40 py-1.5 text-[9px] font-black text-[#F5B800]">
                <ArrowDownToLine size={10} />{T("See the bonus ladder", "বোনাসের ধাপ দেখুন")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
