"use client";
/**
 * BottomBar — real links, not buttons.
 *
 * Each tab is an <a href> to its own route, so the browser's Back/Forward history,
 * a page refresh, Share, and "open in new tab" all work the way a visitor expects.
 * `prefetch` keeps the switch instant.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowDownToLine, BadgePercent, ArrowUpFromLine, UserRound } from "lucide-react";
import { useLang } from "./lang";
import type { MsgKey } from "@/lib/i18n";
import { type TabKey, TAB_PATHS } from "@/lib/routes";

export type { TabKey };

const TABS: Array<{ key: TabKey; key_i18n: MsgKey; icon: any; center?: boolean }> = [
  { key: "home",     key_i18n: "home",      icon: Home },
  { key: "deposit",  key_i18n: "deposit",   icon: ArrowDownToLine },
  { key: "promo",    key_i18n: "promotion", icon: BadgePercent, center: true },
  { key: "withdraw", key_i18n: "withdraw",  icon: ArrowUpFromLine },
  { key: "member",   key_i18n: "member",    icon: UserRound },
];

export default function BottomBar({ tab }: { tab: TabKey }) {
  const { t } = useLang();
  const pathname = usePathname() || "/";
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#F5B800]/25 bg-[#161616]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid h-16 w-full max-w-[480px] grid-cols-5 items-end lg:max-w-[720px]">
        {TABS.map(({ key, key_i18n, icon: Icon, center }) => {
          /* the prize centre lives under the promotion tab, so that chip stays lit there */
          const active = tab === key || (key === "promo" && tab === "prizes");
          const href = TAB_PATHS[key];
          if (center) {
            return (
              <Link key={key} href={href} prefetch aria-label={t(key_i18n)} aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center justify-end pb-1.5 h-16">
                <span className={`absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#121212] bg-gradient-to-b from-[#ffe066] via-[#F5B800] to-[#b87e00] pulse-gold transition-transform ${active ? "scale-110" : ""}`}>
                  <Icon size={26} strokeWidth={2.2} className="text-[#1a1300]" />
                </span>
                <span className={`text-[9px] font-bold mt-6 ${active ? "text-[#F5B800]" : "text-white/55"}`}>{t(key_i18n)}</span>
              </Link>
            );
          }
          return (
            <Link key={key} href={href} prefetch aria-label={t(key_i18n)} aria-current={active ? "page" : undefined}
              className="flex h-16 flex-col items-center justify-center gap-0.5">
              <Icon size={21} strokeWidth={active ? 2.5 : 2} className={active ? "text-[#F5B800]" : "text-white/50"} />
              <span className={`text-[9px] font-semibold ${active ? "text-[#F5B800]" : "text-white/50"}`}>{t(key_i18n)}</span>
            </Link>
          );
        })}
      </div>
      {/* Keeps the current path available to tiny screens that hide the URL bar. */}
      <span className="sr-only" aria-live="polite">{pathname}</span>
    </nav>
  );
}
