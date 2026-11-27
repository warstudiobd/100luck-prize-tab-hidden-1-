"use client";
import { RefreshCw, Crown, User, Plus, Download } from "lucide-react";
import { useState } from "react";
import { useLang } from "./lang";
import AnnouncementBar from "./home/AnnouncementBar";
import { formatTaka } from "@/lib/format";
import type { SessionUser } from "@/lib/types";

/**
 * Two-tier header, 499bet-style:
 *   row 1 — brand emblem + gold wordmark on the left, balance + VIP + account on the right
 *   row 2 — the scrolling announcement strip with the "get the app" chip
 * Everything is icon-led so it stays usable on a 360px phone.
 */
export default function Header({ user, onRefreshBalance, onAuthClick, onLogoClick, onDepositClick }: {
  user: SessionUser | null;
  onRefreshBalance: () => Promise<void>;
  onAuthClick: () => void;
  onLogoClick: () => void;
  onDepositClick: () => void;
}) {
  const { lang, setLang, t } = useLang();
  const [spinning, setSpinning] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-[#F5B800]/25 bg-[#0f0f0f]">
      <div className="mx-auto w-full max-w-[480px] lg:max-w-[1180px]">
        {/* ── row 1: brand + wallet ─────────────────────────────── */}
        <div className="flex h-[42px] items-center gap-1.5 px-2">
          <button onClick={onLogoClick} className="flex min-w-0 items-center gap-1.5 select-none" aria-label={lang === "bn" ? "100LUCK হোম" : "100LUCK home"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem-96.png" alt="100LUCK Casino" width={26} height={26}
              className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-[#F5B800]/45 object-contain shadow-[0_0_8px_rgba(245,184,0,.28)]" />
            <span className="min-w-0 leading-none">
              <span className="gold-text block truncate text-[15px] font-black tracking-[.02em]">100LUCK</span>
              <span className="mt-[2px] block truncate text-[6.5px] font-bold tracking-[.18em] text-[#F5B800]/75">
                {lang === "bn" ? "১০০ লাক ক্যাসিনো" : "100LUCK.COM"}
              </span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* wallet: balance + quick deposit */}
            <div className="flex h-[26px] items-center rounded-full border border-[#F5B800]/45 bg-black/70 pl-1.5 pr-0.5">
              <button onClick={onDepositClick} className="flex items-center gap-1" aria-label={lang === "bn" ? "ডিপোজিট করুন" : "Make a deposit"}>
                <span className="text-[10.5px] font-black tabular-nums text-[#F5B800] whitespace-nowrap">
                  {user ? formatTaka(user.balance_cents) : "৳ 0.00"}
                </span>
                <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-gradient-to-b from-[#ffe066] to-[#F5B800] text-[#1a1300]">
                  <Plus size={11} strokeWidth={3.4} />
                </span>
              </button>
              <button
                onClick={async () => { setSpinning(true); try { await onRefreshBalance(); } finally { setSpinning(false); } }}
                className="ml-0.5 p-1 text-[#F5B800]/70 hover:text-[#F5B800]"
                aria-label={lang === "bn" ? "ব্যালেন্স রিফ্রেশ করুন" : "Refresh balance"}
              >
                <RefreshCw size={10.5} strokeWidth={2.8} className={spinning ? "animate-spin" : ""} />
              </button>
            </div>

            {/* language */}
            <button
              onClick={() => setLang(lang === "bn" ? "en" : "bn")}
              className="h-[20px] rounded-md border border-white/15 bg-white/5 px-1 text-[8.5px] font-bold text-white/75 hover:border-[#F5B800]/50 hover:text-[#F5B800]"
              aria-label={lang === "bn" ? "ভাষা পরিবর্তন করুন" : "Change language"}
            >
              {lang === "bn" ? "EN" : "বাং"}
            </button>

            {/* account / login */}
            {!user ? (
              <button onClick={onAuthClick} className="gold-btn h-[26px] rounded-full px-2.5 text-[10px] whitespace-nowrap">
                {t("login")}
              </button>
            ) : (
              <button onClick={onAuthClick} className="flex flex-col items-center leading-none" aria-label={lang === "bn" ? "অ্যাকাউন্ট" : "Account"}>
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-[#F5B800] bg-gradient-to-b from-[#F5B800] to-[#c98f00] text-[#1a1300]">
                  <User size={14} strokeWidth={2.6} />
                </span>
                <span className="mt-[1px] flex items-center gap-0.5 rounded-full bg-[#F5B800] px-1 text-[6px] font-black text-[#1a1300]">
                  <Crown size={5.5} strokeWidth={4} />VIP{user.vip_level ?? 0}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── row 2: announcement marquee + app chip ────────────── */}
        <AnnouncementBar />
      </div>
    </header>
  );
}
