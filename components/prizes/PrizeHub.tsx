"use client";
/**
 * পুরস্কার — the festival prize hub (v51).
 *
 * Top: laurel crown banner, rotating promo carousel (arrows, real headline
 * numbers only), tab strip (চালমান / শীঘ্রই আসছে / শেষ) and the countdown to the
 * next Asia/Dhaka midnight.
 *
 * Body: four no-wager prize games. Each newly approved deposit of ৳500+ grants
 * one free play per game, with every reward capped at ৳6. Prize Mail retains its
 * informational winners list alongside its free play.
 *
 * Footer: the real winners board and the daily progress bar against ৳1,000.00.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Clock, Trophy } from "lucide-react";
import { useLang } from "../lang";
import { formatTakaCompact as tk } from "@/lib/format";
import { CrownBanner, TrophyIcon, WheelIcon, EnvelopeIcon, GoldenEgg, MailBagIcon } from "./PrizeArt";

type Gate = { gate_cents: number; chip_cents: number; unlocked: boolean; claimed: boolean; progress_cents: number };
type Promo = {
  ok?: boolean; logged_in?: boolean; ends_at: string | null;
  daily_target_cents: number; progress_cents: number; turnover_cents: number;
  open_tickets: number; free_available: boolean; fee_cents: number;
  daily_bonus_max_cents: number; max_tickets_per_day: number; wheel_fee_cents: number; wheel_spins_available: number;
  wager_per_ticket_cents: number; balance_cents: number; egg_count: number; eggs_used: number[];
  tickets: { total: number; gates: Gate[] };
  recent: Array<{ who: string; amount_cents: number; created_at: string }>;
  iphone_winners: Array<{ who: string; created_at: string }>;
  wheel_plays: number;
};

const TABS = [
  { key: "running", bn: "চালমান", en: "Running", icon: "🚀" },
  { key: "soon", bn: "শীঘ্রই আসছে", en: "Coming soon", icon: "⏳" },
  { key: "ended", bn: "শেষ", en: "Ended", icon: "🏆" },
] as const;

export default function PrizeHub({ onBack }: { onBack?: () => void }) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const router = useRouter();

  const [state, setState] = useState<Promo | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("running");
  const [slide, setSlide] = useState(0);
  const [left, setLeft] = useState({ h: 0, m: 0, s: 0 });
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/prizes", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setState(r as Promo);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* countdown to the instant the server sent (next Asia/Dhaka midnight) */
  useEffect(() => {
    if (!state?.ends_at) return;
    const target = new Date(state.ends_at).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setLeft({ h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000), s: Math.floor((ms % 60_000) / 1000) });
    };
    tick();
    timer.current = window.setInterval(tick, 1000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [state?.ends_at]);

  const slides = useMemo(() => [
    { bn: "৳৫০০+ সফল ডিপোজিটে প্রতিটি গেমে ১টি ফ্রি খেলা · সর্বোচ্চ পুরস্কার ৳৬",
      en: "One free play in each game per successful ৳500+ deposit · max reward ৳6",
      accent: "from-[#7a1220] to-[#3a0710]" },
  ], []);

  useEffect(() => {
    const id = window.setInterval(() => setSlide(s => (s + 1) % slides.length), 4200);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const eggsUsed = new Set(state?.eggs_used ?? []);

  const CARDS = [
    {
      key: "wheel", href: "/prizes/spin", art: <WheelIcon size={46} />,
      bn: "লাকি স্পিন", en: "Lucky wheel",
      subBn: "৳৫০০+ সফল ডিপোজিটে ১টি ফ্রি খেলা · সর্বোচ্চ ৳৬",
      subEn: "1 free play per successful ৳500+ deposit · max ৳6",
      badge: null,
    },
    {
      key: "envelope", href: "/prizes/envelope", art: <EnvelopeIcon size={46} />,
      bn: "লাল খাম", en: "Red envelope",
      subBn: "৳৫০০+ সফল ডিপোজিটে ১টি ফ্রি খেলা · সর্বোচ্চ ৳৬",
      subEn: "1 free play per successful ৳500+ deposit · max ৳6",
      badge: null,
    },
    {
      key: "egg", href: "/prizes/egg", art: <GoldenEgg size={52} />,
      bn: "গোল্ডেন এগ", en: "Golden egg",
      subBn: "৳৫০০+ সফল ডিপোজিটে ১টি ফ্রি খেলা · সর্বোচ্চ ৳৬",
      subEn: "1 free play per successful ৳500+ deposit · max ৳6",
      badge: null,
    },
    {
      key: "mail", href: "/prizes/egg#mail", art: <MailBagIcon size={46} />,
      bn: "মেইল", en: "Prize mail",
      subBn: "৳৫০০+ সফল ডিপোজিটে ১টি ফ্রি খেলা · সর্বোচ্চ ৳৬",
      subEn: "1 free play per successful ৳500+ deposit · max ৳6",
      badge: null as string | null,
    },
  ];

  const visibleCards = tab === "running" ? CARDS : [];
  const banner = slides[slide] ?? slides[0];

  return (
    <div className="pb-4">
      {/* ── top bar: back / crown banner / close ─────────────────────────── */}
      <div className="relative bg-gradient-to-b from-[#5c0f16] via-[#2a0a0d] to-[#121212] px-3 pb-2 pt-2">
        <div className="flex items-start justify-between">
          <button onClick={() => (onBack ? onBack() : router.back())} aria-label={T("Back", "পেছনে")}
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
            <ChevronLeft size={16} />
          </button>
          <div className="flex-1 pt-1"><CrownBanner label={T("Prizes", "পুরস্কার")} /></div>
          <Link href="/" prefetch aria-label={T("Close", "বন্ধ")}
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80 active:scale-90">
            <X size={15} />
          </Link>
        </div>

        {/* carousel */}
        <div className={`relative mt-2 overflow-hidden rounded-xl border border-[#FFD75E]/35 bg-gradient-to-r ${banner.accent}`}>
          <div className="flex min-h-[46px] items-center px-8 py-2">
            <p key={slide} className="tab-fade text-center w-full text-[11px] font-black leading-snug text-[#FFE9A3]">
              {lang === "bn" ? banner.bn : banner.en}
            </p>
          </div>
          <button onClick={() => setSlide(s => (s - 1 + slides.length) % slides.length)} aria-label={T("Previous", "আগের")}
            className="absolute left-1 top-1/2 -translate-y-1/2 text-[#FFD75E]/80"><ChevronLeft size={16} /></button>
          <button onClick={() => setSlide(s => (s + 1) % slides.length)} aria-label={T("Next", "পরের")}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[#FFD75E]/80"><ChevronRight size={16} /></button>
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
            {slides.map((_, i) => (
              <span key={i} className={`h-1 w-1 rounded-full ${i === slide ? "bg-[#FFD75E]" : "bg-white/30"}`} />
            ))}
          </div>
        </div>

        {/* tabs */}
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10.5px] font-black transition-colors ${tab === t.key ? "bg-gradient-to-b from-[#FFE9A3] to-[#D89B08] text-[#4a2b00]" : "text-white/55"}`}>
              <span className="text-[12px]">{t.icon}</span>{T(t.en, t.bn)}
            </button>
          ))}
        </div>

        {/* countdown */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <Clock size={11} className="text-[#FFD75E]" />
          <span className="text-[9px] font-bold text-white/45">{T("Time left", "অবশিষ্ট সময়")}</span>
          {[T("hours", "ঘণ্টা"), T("min", "মিনিট"), T("sec", "সেকেন্ড")].map((u, i) => (
            <span key={u} className="flex items-center gap-1">
              <span className="rounded border border-[#FFD75E]/40 bg-black/60 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-[#FFE9A3]">
                {pad(i === 0 ? left.h : i === 1 ? left.m : left.s)}
              </span>
              <span className="text-[8px] text-white/35">{u}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── prize cards ────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3">
        {tab !== "running" ? (
          <div className="rounded-2xl border border-[#FFD75E]/25 bg-black/30 px-4 py-8 text-center">
            <p className="text-[24px]">{tab === "soon" ? "⏳" : "🏆"}</p>
            <p className="mt-1 text-[12px] font-black text-white/80">
              {tab === "soon" ? T("No new prize rounds announced yet", "নতুন পুরস্কার রাউন্ড এখনো ঘোষণা করা হয়নি") : T("Finished rounds can be found here", "শেষ হওয়া রাউন্ড এখানে দেখা যাবে")}
            </p>
            <p className="mt-1 text-[9.5px] leading-snug text-white/45">
              {tab === "soon"
                ? T("The operator publishes a new round from the admin panel; it shows up here the moment it starts.", "অপারেটর অ্যাডমিন প্যানেল থেকে নতুন রাউন্ড প্রকাশ করেন; শুরু হলেই এখানে দেখা যাবে।")
                : T("The daily round resets at 00:00 Asia/Dhaka — today's wins are on the winners board below.", "প্রতিদিন রাত ১২টায় (ঢাকা) রাউন্ড রিসেট হয় — আজকের জয় নিচের বিজয়ী তালিকায়।")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleCards.map(c => (
              <Link key={c.key} href={c.href} prefetch
                className="card-metal relative flex flex-col items-center overflow-hidden rounded-2xl border-[#FFD75E]/35 p-2.5 text-center active:scale-[.98]">
                <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[#FFD75E]/15 blur-xl" />
                <span className="flex h-14 items-center justify-center">{c.art}</span>
                <span className="mt-1 text-[12px] font-black text-white">{T(c.en, c.bn)}</span>
                <span className="mt-0.5 text-[8.5px] leading-snug text-white/55">{T(c.subEn, c.subBn)}</span>
                {c.badge && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-[#FF4A3D] px-1.5 py-0.5 text-[7.5px] font-black text-white">{c.badge}</span>
                )}
                <span className="mt-1.5 rounded-full bg-gradient-to-b from-[#FFE9A3] to-[#D89B08] px-3 py-0.5 text-[9px] font-black text-[#4a2b00]">
                  {T("Claim", "দাবি করুন")}
                </span>
              </Link>
            ))}
          </div>
        )}



        {/* winners board */}
        <div className="mt-3 rounded-2xl border border-[#FFD75E]/25 bg-black/40 p-2.5">
          <p className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-[#FFD75E]">
            <Trophy size={11} />{T("Recent winners", "সাম্প্রতিক বিজয়ী")}
          </p>
          <div className="mt-1 space-y-0.5">
            {(state?.recent ?? []).slice(0, 5).map((r, i) => (
              <div key={`${r.who}-${i}`} className="flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-white/70">
                  <span className="text-[8px] font-black text-[#FFD75E]">#{i + 1}</span>{r.who}
                </span>
                <span className="text-[10px] font-black tabular-nums text-[#FFD75E]">৳{(r.amount_cents / 100).toFixed(2)}</span>
              </div>
            ))}
            {!state?.recent?.length && (
              <p className="py-2 text-center text-[9px] text-white/30">{T("No wins recorded yet today", "আজ এখনো কোনো জয় নেই")}</p>
            )}
          </div>
        </div>

        {/* rules — the honest version of the reference's fine print */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-white/60">{T("How the prizes work", "পুরস্কার কীভাবে কাজ করে")}</p>
          <ul className="mt-1 space-y-1 text-[8.5px] leading-snug text-white/50">
            {(lang === "bn" ? [
              "প্রতিটি নতুন সফল ৳৫০০ বা তার বেশি ডিপোজিটে চারটি গেমের প্রতিটিতে একটি ফ্রি খেলা পাবেন।",
              "কোনো গেমে ফি বা বাজি নেই; প্রতিটি পুরস্কার সর্বোচ্চ ৳৬।",
              "ডিপোজিট সফলভাবে অনুমোদিত হওয়ার পরই ফ্রি খেলা যোগ হয়; পুরোনো ডিপোজিটে নতুন খেলা যোগ হয় না।",
              "প্রাইজ মেইল খেলাটিও একই ফ্রি ডিপোজিট নিয়মে চলে; বিজয়ী তালিকা শুধু তথ্যের জন্য।",
            ] : [
              "Each newly successful deposit of ৳500 or more gives one free play in each of the four games.",
              "No game has a fee or wager; every reward is capped at ৳6.",
              "Free plays are added only after a deposit is successfully approved; past deposits are not backfilled.",
              "Prize Mail follows the same free-deposit rule; its winners list is informational.",
            ]).map((rule, i) => <li key={i} className="flex gap-1"><span className="text-[#FFD75E]">•</span>{rule}</li>)}
          </ul>
        </div>

        {!state?.logged_in && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[#FFD75E]/35 bg-[#FFD75E]/10 p-2.5">
            <TrophyIcon size={22} />
            <p className="flex-1 text-[9.5px] leading-snug text-white/70">
              {T("Log in to use free plays earned from successful ৳500+ deposits.", "৳৫০০+ সফল ডিপোজিটে পাওয়া ফ্রি খেলা ব্যবহার করতে লগইন করুন।")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
