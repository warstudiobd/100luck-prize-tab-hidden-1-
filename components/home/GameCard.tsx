"use client";
import Image from "next/image";
import { memo, useState } from "react";
import { Flame, Heart } from "lucide-react";
import type { GameRow } from "@/lib/types";

/**
 * A single lobby tile.
 *
 * Performance rules (a mid-range phone with 300 tiles on screen):
 *  - NO hover-only work: no hover scale, no backdrop-blur — on Android each blur layer
 *    forces a full repaint of the tile underneath, which is what made scrolling stutter.
 *  - NO IntersectionObserver per tile and no `fill` images: both were previously emitted
 *    for every card.  The thumbnail is a plain optimised <img> with fixed width/height,
 *    so the browser gets the intrinsic size before the bytes arrive (no layout shift).
 *  - Only the first row asks for priority; everything after that is lazy.
 *  - Memoised on the props that actually change, so toggling a favourite or appending a
 *    page does not re-render the whole grid.
 */
function GameCardBase({
  g, fav, label, providerLabel, providerBadge, onLaunch, onToggleFav, eager,
}: {
  g: GameRow;
  fav: boolean;
  label: string;
  providerLabel: string;
  providerBadge: string;
  onLaunch: (game: { game_code: string; title: string; title_bn?: string | null; provider_code: string; thumbnail_url?: string | null; category?: string | null }) => void;
  onToggleFav: (gameCode: string) => void;
  eager?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loaded" | "error">("idle");
  const src = g.thumbnail_url || "";
  // Local pre-generated thumbnails are already the exact size we render, so send
  // them straight from the static file layer instead of paying for a round trip
  // through /_next/image. Remote CDN fallbacks still go through the optimiser,
  // because those originals are full-size.
  const isLocalThumb = src.startsWith("/thumbs/games/");

  return (
    <div className="cv-tile relative overflow-hidden rounded-xl border border-white/8 bg-[#202020]">
      <button className="block w-full text-left" onClick={() => onLaunch({ game_code: g.game_code, title: g.title, title_bn: g.title_bn, provider_code: g.provider_code, thumbnail_url: g.thumbnail_url, category: g.category })} aria-label={label}>
        <div className="relative aspect-square overflow-hidden bg-[#262626]">
          {state !== "loaded" && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a2a2a] to-[#1c1c1c]">
              {state === "error" ? (
                <span className="text-[15px] font-black text-[#F5B800]/80">{providerLabel.slice(0, 3)}</span>
              ) : (
                <span className="h-4 w-4 rounded-md bg-white/10" />
              )}
            </div>
          )}
          {src && state !== "error" && (
            <Image
              src={src}
              alt={label}
              width={160}
              height={160}
              sizes="(max-width: 420px) 118px, 180px"
              quality={75}
              unoptimized={isLocalThumb}
              priority={eager}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              onLoad={() => setState("loaded")}
              onError={() => setState("error")}
              className={`h-full w-full object-cover transition-opacity duration-150 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
            />
          )}
          <span className={`absolute left-1 top-1 max-w-[calc(100%-1.6rem)] truncate rounded px-1 py-0.5 text-[6.5px] font-black leading-none tracking-wide shadow ${providerBadge}`}>{providerLabel}</span>
          {g.is_hot && (
            <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[7px] font-black text-orange-400">
              <Flame size={8} strokeWidth={3} />HOT
            </span>
          )}
        </div>
        <p className="truncate px-1 pb-1.5 pt-1 text-center text-[8.5px] font-bold leading-tight text-white/85">{label}</p>
      </button>
      <button
        onClick={() => onToggleFav(g.game_code)}
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        className="absolute right-1 top-1 z-10 rounded-full border border-white/10 bg-black/60 p-1 active:scale-90">
        <Heart size={12} strokeWidth={2.4} className={fav ? "fill-red-500 text-red-500" : "text-white/75"} />
      </button>
    </div>
  );
}

export default memo(GameCardBase);
