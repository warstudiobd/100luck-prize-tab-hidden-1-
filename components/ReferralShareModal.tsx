"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Copy, Check, Share2, QrCode, Link2, MessageCircle, Send } from "lucide-react";
import { useLang } from "./lang";

/**
 * Referral share sheet.
 *
 * Players are referred by LINK (and its QR), not by typing a code: the sheet
 * builds the absolute `?ref=CODE` URL, offers native share (WhatsApp/Telegram/
 * Messenger on mobile), one-tap WhatsApp/Telegram links, copy, and a scannable
 * QR of that same URL. Nothing here asks the visitor to remember a code.
 */
export default function ReferralShareModal({ code, onClose, showToast }: {
  code: string;
  onClose: () => void;
  showToast?: (msg: string) => void;
}) {
  const { lang } = useLang();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [origin, setOrigin] = useState("https://warstudio.site");

  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);

  const link = useMemo(() => `${origin}/?ref=${encodeURIComponent(code)}`, [origin, code]);
  const qrSrc = useMemo(() => `/api/qr?d=${encodeURIComponent(link)}&s=440`, [link]);
  const shareText = lang === "bn"
    ? `100LUCK ক্যাসিনোতে যোগ দিন — আমার লিংক দিয়ে রেজিস্টার করলেই বোনাস 🎁 ${link}`
    : `Join me on 100LUCK Casino — register with my link and we both get a bonus 🎁 ${link}`;

  async function copy(kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(kind === "link" ? link : code);
      setCopied(kind);
      showToast?.(kind === "link"
        ? (lang === "bn" ? "🔗 রেফারেল লিংক কপি হয়েছে!" : "🔗 Referral link copied!")
        : (lang === "bn" ? "🔑 কোড কপি হয়েছে!" : "🔑 Code copied!"));
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      showToast?.(link);
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "100LUCK Casino", text: shareText, url: link }); return; } catch { /* user cancelled */ }
    }
    copy("link");
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={lang === "bn" ? "রেফারেল শেয়ার" : "Share referral"}>
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="sheet-up relative w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl border border-emerald-400/30 bg-gradient-to-b from-[#1e2422] to-[#141414] p-4 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,.6)]">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Close"><X size={18} /></button>

        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-emerald-400" />
          <h2 className="text-[15px] font-black text-white">{lang === "bn" ? "বন্ধুকে আমন্ত্রণ জানান" : "Invite a friend"}</h2>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-white/50">
          {lang === "bn"
            ? "নিচের লিংক বা QR শেয়ার করুন — বন্ধু এই লিংক দিয়েই রেজিস্টার করবে, কোড লেখার দরকার নেই।"
            : "Share the link or QR below — your friend registers straight from it, no code to type."}
        </p>

        {/* QR — scannable, same URL as the link */}
        <div className="mt-3 flex gap-3">
          <div className="shrink-0 rounded-2xl border border-emerald-400/30 bg-white p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={lang === "bn" ? "রেফারেল QR কোড" : "Referral QR code"} width={132} height={132} className="h-[132px] w-[132px] rounded-lg" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/90">{lang === "bn" ? "আপনার রেফারেল লিংক" : "Your referral link"}</p>
            <p className="mt-1 break-all text-[10.5px] font-semibold leading-snug text-white/85">{link}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={() => copy("link")} className="flex h-8 items-center gap-1 rounded-lg border border-emerald-400/45 bg-emerald-400/10 px-2 text-[10px] font-black text-emerald-400 active:scale-95">
                {copied === "link" ? <Check size={12} /> : <Copy size={12} />}{lang === "bn" ? "লিংক কপি" : "Copy link"}
              </button>
              <button onClick={() => copy("code")} className="flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 text-[10px] font-bold text-white/60 active:scale-95">
                {copied === "code" ? <Check size={12} /> : <Link2 size={12} />}{code}
              </button>
            </div>
          </div>
        </div>

        {/* One-tap share channels */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#25D366]/45 bg-[#25D366]/12 text-[11px] font-black text-[#3ddc74] active:scale-95">
            <MessageCircle size={14} />WhatsApp
          </a>
          <a href={tg} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#2AABEE]/45 bg-[#2AABEE]/12 text-[11px] font-black text-[#5cc4f5] active:scale-95">
            <Send size={14} />Telegram
          </a>
          <button onClick={nativeShare} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#F5B800]/45 bg-[#F5B800]/12 text-[11px] font-black text-[#F5B800] active:scale-95">
            <Share2 size={14} />{lang === "bn" ? "শেয়ার" : "Share"}
          </button>
        </div>

        <p className="mt-2.5 text-center text-[9px] text-white/35">
          {lang === "bn" ? "বন্ধু ডিপোজিট করলেই আপনার বোনাস যোগ হবে" : "Bonus lands once your friend deposits"}
        </p>
      </div>
    </div>
  );
}
