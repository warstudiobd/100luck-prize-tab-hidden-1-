"use client";
import { useEffect, useState } from "react";
import { Volume2, Image as ImageIcon, X, Download } from "lucide-react";
import { useLang } from "../lang";
import { useRules } from "@/lib/useRules";
import { taka, takaRound } from "@/lib/rules";

/** Only claims that are backed by code belong in here. The old "10% cashback
 *  every Friday" line had no payout path behind it, so it is gone: an offer a
 *  player can't actually collect is a promise we can't keep. */
const defaultItems = (fee: string, ref: string, bn: boolean) => [
  bn ? `🎡 লাকি স্পিন ${fee} — যত খুশি খেলুন` : `🎡 Lucky Spin ${fee} — play as often as you like`,
  bn ? `🤝 বন্ধু রেফার করুন — যোগ্য হলে ${ref} বোনাস` : `🤝 Refer a friend — ${ref} bonus once they qualify`,
  bn ? "💸 bKash/Nagad ডিপোজিট অনুমোদিত হলেই ওয়ালেটে যোগ হয়" : "💸 bKash/Nagad deposits credited once approved",
  bn ? "🎧 টেলিগ্রামে এজেন্ট — @warstudiosite" : "🎧 Telegram agent — @warstudiosite",
];

interface LiveAnnouncement { id: number; text_en: string; text_bn: string; image_url?: string }

export default function AnnouncementBar() {
  const { lang } = useLang();
  const [live, setLive] = useState<LiveAnnouncement[] | null>(null);
  const [lightbox, setLightbox] = useState<LiveAnnouncement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.ok) setLive(Array.isArray(d.announcements) ? d.announcements : []); })
      .catch(() => { if (!cancelled) setLive([]); });
    return () => { cancelled = true; };
  }, []);

  // Admin-published announcements win; fall back to built-in defaults when none exist.
  const rules = useRules();
  const items = live && live.length
    ? live.map(a => (lang === "bn" && a.text_bn.trim() ? a.text_bn : a.text_en))
    : defaultItems(taka(rules.play_fee_cents), takaRound(rules.referral_bonus_cents), lang === "bn");
  const line = items.join("   ✦   ");
  const imageAnnouncements = (live ?? []).filter(a => a.image_url);

  return (
    <div className="flex items-center gap-1.5 h-[26px] border-t border-white/5 bg-[#131313] px-2 overflow-hidden">
      <Volume2 size={12} className="text-[#F5B800] shrink-0" strokeWidth={2.6} />
      <div className="relative flex-1 overflow-hidden">
        <div className="marquee-track whitespace-nowrap text-[9.5px] font-medium text-white/60">
          <span className="pr-16">{line}</span>
          <span className="pr-16">{line}</span>
        </div>
      </div>
      {imageAnnouncements.length > 0 && (
        <button onClick={() => setLightbox(imageAnnouncements[0])} aria-label={lang === "bn" ? "ছবি ঘোষণা দেখুন" : "View announcement picture"}
          className="shrink-0 flex items-center gap-1 rounded-md border border-[#F5B800]/35 bg-[#F5B800]/10 px-1.5 py-1 text-[9px] font-black text-[#F5B800] active:scale-95">
          <ImageIcon size={11} strokeWidth={2.4} />{lang === "bn" ? "দেখুন" : "View"}
        </button>
      )}
      <button onClick={() => {
          /* same one-tap download as the floating logo */
          const a = document.createElement("a");
          a.href = "/download/100LUCK-1.0.0.apk";
          a.download = "100LUCK.apk";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }}
        className="shrink-0 flex items-center gap-0.5 rounded bg-[#F5B800] px-1 py-[2px] text-[7px] font-black uppercase leading-none text-[#1a1300] active:scale-95"
        aria-label={lang === "bn" ? "অ্যাপ ডাউনলোড" : "Download app"}>
        <Download size={7} strokeWidth={3.4} />APP
      </button>
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={lang === "bn" ? "ঘোষণা" : "Announcement"}>
          <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onClick={() => setLightbox(null)} aria-label={lang === "bn" ? "বন্ধ করুন" : "Close"} />
          <div className="relative w-full max-w-[400px] overflow-hidden rounded-3xl border border-[#F5B800]/35 bg-[#1a1a1a] shadow-[0_20px_60px_rgba(0,0,0,.7)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.image_url} alt={lightbox.text_en || "Announcement"} className="max-h-[52vh] w-full object-cover" />
            <p className="p-4 text-center text-[12px] font-bold leading-snug text-white/90">
              {lang === "bn" && lightbox.text_bn.trim() ? lightbox.text_bn : lightbox.text_en}
            </p>
            <button type="button" onClick={() => setLightbox(null)} aria-label={lang === "bn" ? "বন্ধ করুন" : "Close"}
              className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white/85 transition hover:text-white"><X size={17} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
