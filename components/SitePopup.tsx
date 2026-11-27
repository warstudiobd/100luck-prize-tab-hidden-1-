"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLang } from "./lang";

type Popup = {
  id: number; title_en: string; title_bn: string;
  body_en: string; body_bn: string; image_url: string;
};

/** Site-open popup — shows on every website visit until dismissed for this visit. */
export default function SitePopup() {
  const { lang } = useLang();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/popup", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!cancelled && d?.ok && d.popup) { setPopup(d.popup as Popup); setOpen(true); }
      })
      .catch(() => { /* popup unavailable — stay silent */ });
    return () => { cancelled = true; };
  }, []);

  if (!popup || !open) return null;
  const title = (lang === "bn" ? popup.title_bn : popup.title_en).trim() || popup.title_en || popup.title_bn;
  const body  = (lang === "bn" ? popup.body_bn : popup.body_en).trim() || popup.body_en || popup.body_bn;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title || (lang === "bn" ? "ঘোষণা" : "Announcement")}>
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-label={lang === "bn" ? "বন্ধ করুন" : "Close"} />
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-3xl border border-[#F5B800]/35 bg-[#1a1a1a] shadow-[0_20px_60px_rgba(0,0,0,.7)]">
        {popup.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={popup.image_url} alt={title || "Promotion"} className="max-h-[46vh] w-full object-cover" />
        ) : null}
        <div className="p-4 text-center">
          {title ? <p className="text-[15px] font-black leading-snug text-[#F5B800]">{title}</p> : null}
          {body ? <p className="mt-1.5 whitespace-pre-line text-[11px] leading-snug text-white/85">{body}</p> : null}
          <button type="button" onClick={() => setOpen(false)} className="gold-btn mt-3 h-10 w-full rounded-xl text-[12px] font-black">
            {lang === "bn" ? "বুঝেছি" : "Got it"}
          </button>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={lang === "bn" ? "বন্ধ করুন" : "Close"}
          className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white/85 transition hover:text-white">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
