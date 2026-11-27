"use client";
import { useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck, Wifi } from "lucide-react";
import { useLang } from "./lang";

/**
 * Vertical-mode game overlay.
 * Every game renders inside a portrait phone-sized frame (max 480px wide,
 * full viewport height) — never fullscreen / landscape "full scene" mode.
 * The iframe deliberately does NOT allow the fullscreen API, so providers
 * cannot lock the screen into landscape either. Balance refreshes on close.
 */
export default function Launcher({ url, title, demo, onClose }: { url: string; title: string; demo: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black" role="dialog" aria-modal aria-label={title}>
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden border-x border-white/10 bg-[#0d0d0d] md:my-3 md:h-[calc(100dvh-1.5rem)] md:rounded-2xl">
        {/* Portrait top bar — back button always visible, never overlapping the game */}
        <div className="relative flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[#F5B800]/20 bg-black px-2">
          <button
            onClick={onClose}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#F5B800]/60 bg-black/75 pl-2 pr-3 text-[11px] font-black text-[#F5B800] active:scale-95">
            <ArrowLeft size={15} strokeWidth={2.6} /> {lang === "bn" ? "লবিতে ফিরুন" : "Back to Lobby"}
          </button>
          <p className="gold-text max-w-[150px] truncate text-[10px] font-black uppercase tracking-widest">{title}</p>
          <div className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-emerald-400/40 bg-black/75 px-2 text-[8px] font-black uppercase tracking-widest text-emerald-400">
            <ShieldCheck size={11} /> {lang === "bn" ? "সিমলেস ওয়ালেট" : "Seamless"}
          </div>
        </div>

        {/* Game viewport — vertical, bounded by the portrait frame */}
        <div className="relative min-h-0 flex-1">
          {!loaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#121212]">
              <svg width="72" height="72" viewBox="0 0 40 40" className="animate-pulse">
                <rect x="1.5" y="1.5" width="37" height="37" rx="9" fill="#1b1b1b" stroke="#F5B800" strokeWidth="2.2"/>
                <path d="M9 26 L12.5 13.5 L18 21 L20 10.5 L22 21 L27.5 13.5 L31 26 Z" fill="#F5B800"/>
              </svg>
              <p className="gold-text text-lg font-black">{title}</p>
              <p className="flex items-center gap-2 text-[11px] text-white/50"><Loader2 size={13} className="animate-spin" /> {demo ? (lang === "bn" ? "ডেমো গেম চালু হচ্ছে…" : "Launching demo game…") : (lang === "bn" ? "প্রোভাইডারের সাথে সংযোগ হচ্ছে…" : "Connecting to provider…")}</p>
              <p className="flex items-center gap-1.5 text-[8px] uppercase tracking-[.25em] text-emerald-400/70"><Wifi size={10} /> {lang === "bn" ? "এনক্রিপ্টেড · ৳ বিডিটি" : "Encrypted · BDT"}</p>
            </div>
          )}
          <iframe
            src={url}
            title={title}
            onLoad={() => setLoaded(true)}
            allow="autoplay; payment; gamepad"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
