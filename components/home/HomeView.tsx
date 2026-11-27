"use client";
import { useRef, useState } from "react";
import PromoSlider from "./PromoSlider";
import QuickActions from "./QuickActions";
import SupportChat from "../SupportChat";
import GameLobby from "./GameLobby";
import type { TabKey } from "../BottomBar";
import { useRouter } from "next/navigation";
import { useLang } from "../lang";
import { openTelegram } from "@/lib/telegram";

export default function HomeView({ onLaunch, showToast, setTab, onAuthClick }: {
  onLaunch: (game: { game_code: string; title: string; title_bn?: string | null; provider_code: string; thumbnail_url?: string | null; category?: string | null }) => void;
  showToast: (msg: string) => void;
  setTab: (t: TabKey) => void;
  onAuthClick: () => void;
}) {
  const { lang } = useLang();
  const lobbyRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);

  const handleAction = (a: string) => {
    switch (a) {
      case "support":  router.push("/member/support"); break;
      case "cashback": setTab("promo"); break;
      case "agent":    showToast(lang === "bn" ? "🤝 এজেন্ট হতে Telegram করুন: @warstudiosite — কমিশন সর্বোচ্চ ৫০% পর্যন্ত" : "🤝 Become an agent on Telegram: @warstudiosite — up to 50% commission"); openTelegram(); break;
      case "rewards":  setTab("promo"); break;
    }
  };

  return (
    <div>
      <PromoSlider onCta={() => setTab("promo")} />
      <QuickActions onAction={handleAction} />
      <div ref={lobbyRef} className="scroll-mt-16">
        <GameLobby onLaunch={onLaunch} />
      </div>
      <p className="text-center text-[8px] text-white/25 py-4 tracking-widest">100LUCK GAMING · 18+ · License GLH-OCCHKTW · {lang === "bn" ? "সতর্কতার সাথে খেলুন" : "Play Responsibly"}</p>
      {chatOpen && <SupportChat onClose={() => setChatOpen(false)} onAuthClick={onAuthClick} />}
    </div>
  );
}
