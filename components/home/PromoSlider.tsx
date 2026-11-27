"use client";
import { useEffect, useRef, useState } from "react";
import { BadgePercent, Users, ChevronRight, Sparkles } from "lucide-react";
import { useLang } from "../lang";
import { useRules } from "@/lib/useRules";
import { taka, takaRound } from "@/lib/rules";

const SLIDES = [
  {
    id: 0, icon: Sparkles, tagEn: "LUCKY SPIN", tagBn: "লাকি স্পিন",
    titleBn: "", titleEn: "",   // filled from /api/rules below
    titleKey: "spin",
    subBn: "", subEn: "",
    cta: "spin", grad: "from-[#3a2c00] via-[#241a00] to-[#121212]", accent: "#F5B800",
  },
  {
    id: 1, icon: BadgePercent, tagEn: "FRIDAY CASHBACK", tagBn: "শুক্রবার ক্যাশব্যাক",
    titleBn: "১০% আনলিমিটেড ক্যাশব্যাক", titleEn: "10% Unlimited Cashback",
    subBn: "প্রতি শুক্রবার — সোমবার অটো ক্রেডিট", subEn: "Every Friday — credited Monday",
    cta: "cashback", grad: "from-[#3a0d0d] via-[#230808] to-[#121212]", accent: "#ff6b4a",
  },
  {
    id: 2, icon: Users, tagEn: "REFER & EARN", tagBn: "রেফার করে নিন",
    titleBn: "", titleEn: "",
    titleKey: "refer",
    subBn: "", subEn: "",
    cta: "refer", grad: "from-[#22103a] via-[#160a26] to-[#121212]", accent: "#c084fc",
  },
];

export default function PromoSlider({ onCta }: { onCta: (what: string) => void }) {
  const { lang } = useLang();
  const rules = useRules();

  /** The spin and referral slides quote money, so their copy is built from
   *  /api/rules at render time — never from a literal. */
  const liveText = (s: (typeof SLIDES)[number]) => {
    if (s.titleKey === "spin") {
      const fee = taka(rules.play_fee_cents);
      return {
        title: lang === "bn" ? `লাকি স্পিন — ${fee} থেকে` : `Lucky Spin — from ${fee}`,
        sub:   lang === "bn" ? `প্রতি স্পিন ${fee}, কোনো লিমিট নেই` : `${fee} a spin, no limit`,
      };
    }
    if (s.titleKey === "refer") {
      const amt = takaRound(rules.referral_bonus_cents);
      return {
        title: lang === "bn" ? `বন্ধু আনুন, ${amt} নিন` : `Refer & Earn ${amt}`,
        sub:   lang === "bn" ? `বন্ধু রেফার করলে ${amt} — শর্ত পূরণ হলে অটো ক্রেডিট`
                             : `Get ${amt} when your friend qualifies — credited automatically`,
      };
    }
    return { title: lang === "bn" ? s.titleBn : s.titleEn, sub: lang === "bn" ? s.subBn : s.subEn };
  };
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setInterval(() => setI(v => (v + 1) % SLIDES.length), 4500);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  const go = (dir: 1 | -1) => setI(v => (v + dir + SLIDES.length) % SLIDES.length);

  return (
    <div className="px-3 pt-3">
      <div
        className="relative h-[104px] rounded-2xl overflow-hidden select-none"
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {SLIDES.map((s, idx) => {
          const Icon = s.icon;
          const active = idx === i;
          return (
            <div key={s.id}
              className={`absolute inset-0 bg-gradient-to-br ${s.grad} border border-[#F5B800]/20 transition-all duration-500 ease-out flex items-center px-4 gap-3 ${active ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none translate-x-6"}`}
              aria-hidden={!active}>
              {/* decorative rings */}
              <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full border-[14px] opacity-20" style={{ borderColor: s.accent }} />
              <div className="absolute -right-2 bottom-[-30px] h-24 w-24 rounded-full border-[10px] opacity-15" style={{ borderColor: s.accent }} />
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/45 shadow-inner">
                <Icon size={30} style={{ color: s.accent }} strokeWidth={1.8} />
                <Sparkles size={12} className="absolute -right-1.5 -top-1.5 text-[#F5B800]" />
              </div>
              <div className="relative min-w-0">
                <p className="text-[8px] font-black tracking-[.22em]" style={{ color: s.accent }}>{lang === "bn" ? s.tagBn : s.tagEn}</p>
                <p className="text-[15px] leading-tight font-black text-white truncate">{liveText(s).title}</p>
                <p className="text-[10px] text-white/65 truncate mt-0.5">{liveText(s).sub}</p>
                <button onClick={() => onCta(s.cta)}
                  className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#F5B800] hover:text-[#ffe066]">
                  {lang === "bn" ? "বিস্তারিত" : "View offer"} <ChevronRight size={11} strokeWidth={3} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* dots */}
      <div className="flex justify-center gap-1.5 mt-1.5">
        {SLIDES.map((s, idx) => (
          <button key={s.id} onClick={() => setI(idx)} aria-label={lang === "bn" ? `স্লাইড ${idx + 1}` : `Slide ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${idx === i ? "w-5 bg-[#F5B800]" : "w-1.5 bg-white/20"}`} />
        ))}
      </div>
    </div>
  );
}
