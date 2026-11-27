"use client";
/**
 * Floating prize dock (v51) — the vertical pill that rides on the right edge of
 * every player screen, exactly like the reference.
 *
 * Four illustrated entries (পুরস্কার / লাকি স্পিন / লাল খাম / মেইল), each with a
 * round gold badge that turns into a dot when that entry has something real
 * waiting: a free ticket today, enough turnover for a wheel spin, a deposit step
 * that unlocked. The badges read from /api/prizes, so the dot is never decorative.
 *
 * Collapse chevron folds the dock to a single trophy button; ✕ hides it for the
 * session (remembered in sessionStorage) and the header link brings it back.
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useLang } from "../lang";
import { TrophyIcon, WheelIcon, EnvelopeIcon, MailBagIcon } from "./PrizeArt";

type PrizeState = {
  ok?: boolean; logged_in?: boolean;
  open_tickets?: number; free_available?: boolean;
  balance_cents?: number; fee_cents?: number; wheel_fee_cents?: number; wheel_spins_available?: number;
  tickets?: { gates: Array<{ unlocked: boolean; claimed: boolean }> };
  daily_bonus_available?: boolean;
  game_credits?: Record<string, { available: number; used: number }>;
};

const HIDE_KEY = "prize-dock-hidden";

export default function PrizeDock() {
  const { lang } = useLang();
  const pathname = usePathname() || "/";
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [state, setState] = useState<PrizeState | null>(null);

  useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDE_KEY) === "1"); } catch { /* private mode */ }
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/prizes", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setState(r as PrizeState);
  }, []);

  /* re-read on every navigation so a claim made on one screen shows up on the next */
  useEffect(() => { load(); }, [load, pathname]);

  const hide = () => {
    setHidden(true);
    try { sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* ignore */ }
  };

  if (hidden) return null;

  const dots = {
    prizes: Boolean(state?.game_credits && Object.values(state.game_credits).some(g => g.available > 0)),
    spin: Number(state?.wheel_spins_available ?? 0) > 0,
    envelope: Number(state?.game_credits?.envelope?.available ?? 0) > 0,
    mail: Number(state?.game_credits?.mail?.available ?? 0) > 0,
  };

  const ENTRIES = [
    { key: "prizes", href: "/prizes", icon: <TrophyIcon size={22} />, bn: "পুরস্কার", en: "Prizes", dot: dots.prizes },
    { key: "spin", href: "/prizes/spin", icon: <WheelIcon size={22} />, bn: "লাকি স্পিন", en: "Lucky spin", dot: dots.spin },
    { key: "envelope", href: "/prizes/envelope", icon: <EnvelopeIcon size={22} />, bn: "লাল খাম", en: "Red envelope", dot: dots.envelope },
    { key: "mail", href: "/prizes/egg", icon: <MailBagIcon size={22} />, bn: "মেইল", en: "Prize mail", dot: dots.mail },
  ];

  return (
    <aside
      aria-label={T("Prize dock", "পুরস্কার ডক")}
      /* sits above the tab bar AND above the SaleSmartly chat bubble (which owns
         the bottom-right corner), so neither covers the other */
      className="fixed right-0 bottom-[9.75rem] z-40 flex max-h-[62vh] flex-col items-end overflow-y-auto"
    >
      <div className="pointer-events-auto mb-1 flex flex-col items-center gap-1">
        <button onClick={() => setOpen(v => !v)} aria-label={open ? T("Collapse", "ছোট করুন") : T("Expand", "খুলুন")}
          className="flex h-6 w-9 items-center justify-center rounded-l-full border border-r-0 border-[#FFD75E]/50 bg-[#2a1a06]/95 text-[#FFD75E] shadow-lg active:scale-95">
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        {open && (
          <button onClick={hide} aria-label={T("Close dock", "ডক বন্ধ করুন")}
            className="flex h-6 w-9 items-center justify-center rounded-l-full border border-r-0 border-white/15 bg-black/80 text-white/60 active:scale-95">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="pointer-events-auto overflow-hidden rounded-l-2xl border border-r-0 border-[#FFD75E]/35 bg-[#1a1206] shadow-[0_8px_28px_rgba(0,0,0,.55)]">
        {ENTRIES.map((e, i) => (
          <Link key={e.key} href={e.href} prefetch
            className={`relative flex w-[74px] flex-col items-center gap-0.5 px-1 py-2 active:bg-[#FFD75E]/10 ${i > 0 ? "border-t border-white/10" : ""} ${open ? "" : "hidden"}`}>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_25%,#3a2405,#150d02)] ring-1 ring-[#FFD75E]/50">
              {e.icon}
              {e.dot && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#1a1206] bg-[#FF4A3D] shadow-[0_0_6px_rgba(255,74,61,.9)]" />}
            </span>
            <span className="text-center text-[8.5px] font-black leading-tight text-[#FFE9A3]">{T(e.en, e.bn)}</span>
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-b from-[#FFF3C4] to-[#D89B08] text-[8px] font-black text-[#5a3700]">৳</span>
          </Link>
        ))}
      </div>

      {/* collapsed: one round trophy handle so the function is never lost */}
      {!open && (
        <Link href="/prizes" prefetch aria-label={T("Prize centre", "পুরস্কার কেন্দ্র")}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-l-full border border-r-0 border-[#FFD75E]/50 bg-[#1a1206]/95 shadow-lg">
          <TrophyIcon size={22} />
        </Link>
      )}
    </aside>
  );
}
