"use client";
import { useEffect, useState } from "react";
import { Loader2, Play, Sparkles, X } from "lucide-react";
import { useLang } from "./lang";

export interface LaunchGameInfo {
  game_code: string;
  title: string;
  title_bn?: string | null;
  provider_code: string;
  thumbnail_url?: string | null;
  category?: string | null;
}

/**
 * Game launch sheet (499bet style).
 *
 * Tapping a tile no longer fires a request straight away — it opens this sheet so
 * the player explicitly picks how to play:
 *   • খেলুন / Play        → real money, debited/credited against their wallet
 *   • ফ্রি ট্রায়াল / Free Trial → provider demo mode, no real money involved
 *
 * The sheet fetches nothing until a button is pressed, so opening it is instant
 * even on a slow connection; the chosen button shows its own spinner while the
 * provider is contacted.
 *
 * v53: the scrim is a plain black tint, not `backdrop-blur` — blurring a full
 * 390×844 lobby behind the sheet cost ~90 ms per frame on a throttled phone.
 */
export default function GameLaunchSheet({
  game, balanceLabel, isLoggedIn, onClose, onPlay, onTrial,
}: {
  game: LaunchGameInfo;
  balanceLabel?: string;
  isLoggedIn: boolean;
  onClose: () => void;
  onPlay: () => Promise<void>;
  onTrial: () => Promise<void>;
}) {
  const { lang, t } = useLang();
  const [busy, setBusy] = useState<"real" | "trial" | null>(null);
  const title = lang === "bn" && game.title_bn ? game.title_bn : game.title;

  // Escape closes the sheet; body scroll is locked while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const run = async (mode: "real" | "trial") => {
    if (busy) return;
    setBusy(mode);
    try { await (mode === "real" ? onPlay() : onTrial()); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal aria-label={title}>
      <button aria-label={t("close")} onClick={onClose} className="absolute inset-0 bg-black/80" />
      <div className="relative w-full max-w-[480px] rounded-t-2xl border-t border-[#F5B800]/30 bg-[#171717] p-3 pb-4 shadow-[0_-8px_40px_rgba(0,0,0,.7)]">
        <button onClick={onClose} aria-label={t("close")}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/70 active:scale-90">
          <X size={14} />
        </button>

        {/* Thumbnail + identity */}
        <div className="flex items-start gap-3 pr-8">
          <div className="relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#242424]">
            {game.thumbnail_url
              ? <img src={game.thumbnail_url} alt={title} className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-[11px] font-black text-[#F5B800]/70">{game.provider_code.slice(0, 3)}</div>}
          </div>
          <div className="min-w-0 pt-1">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">{game.provider_code.replace(/_/g, " ")}</p>
            <h2 className="mt-0.5 truncate text-[15px] font-black leading-tight text-white">{title}</h2>
            {lang === "bn" && game.title_bn && game.title !== game.title_bn && (
              <p className="mt-0.5 truncate text-[9.5px] text-white/35">{game.title}</p>
            )}
            {balanceLabel && isLoggedIn && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#F5B800]/30 bg-[#F5B800]/10 px-2 py-0.5 text-[9px] font-black text-[#F5B800]">
                {t("balance_label")}: {balanceLabel}
              </p>
            )}
          </div>
        </div>

        {/* Two ways to play */}
        <div className="mt-3 grid gap-2">
          {/* Real money */}
          <button
            onClick={() => run("real")}
            disabled={!!busy}
            className="relative flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#F5B800] to-[#d9a300] text-[15px] font-black text-[#1a1300] shadow-[0_4px_16px_rgba(245,184,0,.32)] transition-transform active:scale-[.98] disabled:opacity-70">
            {busy === "real" ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} strokeWidth={2.8} className="fill-[#1a1300]" />}
            {busy === "real" ? t("launching_real") : t("play_now")}
            <span className="absolute bottom-1 right-2 text-[7px] font-bold uppercase tracking-wider text-[#1a1300]/60">{t("play_real_note")}</span>
          </button>

          {/* Free trial */}
          <button
            onClick={() => run("trial")}
            disabled={!!busy}
            className="relative flex h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#3ba9ff]/70 bg-[#3ba9ff]/12 text-[14px] font-black text-[#7dc6ff] transition-transform active:scale-[.98] disabled:opacity-70">
            {busy === "trial" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {busy === "trial" ? t("launching_trial") : t("free_trial")}
            <span className="absolute bottom-1 right-2 text-[7px] font-bold uppercase tracking-wider text-[#7dc6ff]/60">{t("trial_note")}</span>
          </button>
        </div>

        {!isLoggedIn && (
          <p className="mt-2 text-center text-[9px] text-white/40">
            {lang === "bn" ? "রিয়েল মানি খেলতে লগইন করুন — ফ্রি ট্রায়াল লগইন ছাড়াও চলে।" : "Log in to play with real money — free trial works without logging in."}
          </p>
        )}
      </div>
    </div>
  );
}
