"use client";
import { Headset, BadgePercent, Handshake, Gift } from "lucide-react";
import { useLang } from "../lang";
import type { MsgKey } from "@/lib/i18n";

const ACTIONS: Array<{ key_i18n: MsgKey; icon: any; color: string; bg: string; action: string }> = [
  { key_i18n: "support",   icon: Headset,      color: "#4ade80", bg: "from-[#22c55e]/25", action: "support" },
  { key_i18n: "cashback",  icon: BadgePercent, color: "#f87171", bg: "from-[#ef4444]/25", action: "cashback" },
  { key_i18n: "agent",     icon: Handshake,    color: "#c084fc", bg: "from-[#a855f7]/25", action: "agent" },
  { key_i18n: "rewards",   icon: Gift,         color: "#F5B800", bg: "from-[#F5B800]/25", action: "rewards" },
];

export default function QuickActions({ onAction }: { onAction: (a: string) => void }) {
  const { t } = useLang();
  return (
    <div className="mt-2.5 grid grid-cols-4 gap-1.5 px-3 lg:mx-auto lg:max-w-[760px] lg:gap-3 lg:px-0">
      {ACTIONS.map(({ key_i18n, icon: Icon, color, bg, action }) => (
        <button key={action} onClick={() => onAction(action)}
          className="flex flex-col items-center gap-1 rounded-2xl border border-white/8 bg-[#1E1E1E] py-2 active:scale-95 transition-transform">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${bg} to-transparent border border-white/10`}>
            <Icon size={21} style={{ color }} strokeWidth={2} />
          </span>
          <span className="text-[8.5px] font-bold text-white/75 leading-tight text-center">{t(key_i18n)}</span>
          {action === "agent" && <span className="text-[6.5px] font-bold text-sky-300/90 leading-none">Telegram</span>}
        </button>
      ))}
    </div>
  );
}
