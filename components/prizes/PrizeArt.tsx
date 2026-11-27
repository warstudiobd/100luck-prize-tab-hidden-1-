"use client";
/**
 * Inline illustrations for the prize centre (v51).
 *
 * Nothing here loads a network asset: every icon is SVG + gradients, so the page
 * renders identically in the sandboxed preview, offline, and on a slow phone.
 */
import { useId } from "react";

type Sz = { size?: number; className?: string };

/** Crown + laurel garland behind the পুরস্কার title. */
export function LaurelCrown({ size = 30 }: Sz) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="lcGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A3" /><stop offset=".5" stopColor="#FFC83D" /><stop offset="1" stopColor="#C98A05" />
        </linearGradient>
      </defs>
      <path d="M32 18 L38 8 L44 16 L32 22 L20 16 L26 8 Z" fill="url(#lcGold)" stroke="#7a5300" strokeWidth="1.2" />
      <circle cx="32" cy="6" r="2.2" fill="#FFE9A3" />
      <path d="M10 34c0 12 8 20 22 22" stroke="#E8B23C" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M54 34c0 12-8 20-22 22" stroke="#E8B23C" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <ellipse cx={12 + i * 1.6} cy={32 + i * 6} rx="5.4" ry="3" fill="#F2C94C" opacity=".9" transform={`rotate(${-35 + i * 6} ${12 + i * 1.6} ${32 + i * 6})`} />
          <ellipse cx={52 - i * 1.6} cy={32 + i * 6} rx="5.4" ry="3" fill="#F2C94C" opacity=".9" transform={`rotate(${35 - i * 6} ${52 - i * 1.6} ${32 + i * 6})`} />
        </g>
      ))}
    </svg>
  );
}

/** The trophy dock tile. */
export function TrophyIcon({ size = 26 }: Sz) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A3" /><stop offset="1" stopColor="#D89B08" />
        </linearGradient>
      </defs>
      <path d="M10 4h12v6a6 6 0 0 1-12 0V4z" fill="url(#trG)" stroke="#8a5f00" strokeWidth="1" />
      <path d="M10 6H7a3 3 0 0 0 3 6M22 6h3a3 3 0 0 1-3 6" stroke="#F4C752" strokeWidth="1.8" fill="none" />
      <rect x="14" y="16" width="4" height="5" fill="#C98A05" />
      <path d="M10 26h12l-1.5-4h-9L10 26z" fill="url(#trG)" stroke="#8a5f00" strokeWidth="1" />
    </svg>
  );
}

/** Prize wheel dock tile. */
export function WheelIcon({ size = 26 }: Sz) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`wh${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF6A4A" /><stop offset="1" stopColor="#B01B0B" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="12.5" fill={`url(#wh${id})`} stroke="#FFD75E" strokeWidth="2" />
      {Array.from({ length: 8 }).map((_, i) => (
        <path key={i} d={`M16 16 L16 3.5 A12.5 12.5 0 0 1 ${16 + 12.5 * Math.sin(Math.PI / 4)} ${16 - 12.5 * Math.cos(Math.PI / 4)} Z`}
          fill="none" stroke="#FFD75E" strokeWidth=".9" opacity=".75"
          transform={`rotate(${i * 45} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="4" fill="#FFF3C4" stroke="#D89B08" strokeWidth="1.4" />
    </svg>
  );
}

/** Red envelope (লাল খাম) dock tile. */
export function EnvelopeIcon({ size = 26 }: Sz) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="envR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6B4A" /><stop offset="1" stopColor="#B3140A" />
        </linearGradient>
      </defs>
      <rect x="4" y="7" width="24" height="19" rx="3" fill="url(#envR)" stroke="#FFD75E" strokeWidth="1.4" />
      <path d="M5 9l11 8 11-8" fill="none" stroke="#FFD75E" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="18.5" r="4.2" fill="#FFD75E" stroke="#8a5f00" strokeWidth="1" />
      <text x="16" y="21.4" textAnchor="middle" fontSize="6.4" fontWeight="900" fill="#8a5f00">৳</text>
    </svg>
  );
}

/** Golden money bag (মেইল) dock tile. */
export function MailBagIcon({ size = 26 }: Sz) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="bagG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A3" /><stop offset="1" stopColor="#D08C05" />
        </linearGradient>
      </defs>
      <path d="M12 4h8l-2 5h-4L12 4z" fill="#B87C05" stroke="#7a5300" strokeWidth="1" />
      <path d="M16 9c5 0 9 5.4 9 12 0 4-3.4 7-9 7s-9-3-9-7c0-6.6 4-12 9-12z" fill="url(#bagG)" stroke="#8a5f00" strokeWidth="1.2" />
      <text x="16" y="24" textAnchor="middle" fontSize="9" fontWeight="900" fill="#7a4b00">৳</text>
    </svg>
  );
}

/** A gold envelope for the red-envelope screen (bigger, decorated). */
export function BigEnvelope({ width = 104, height = 84, dim = false }: { width?: number; height?: number; dim?: boolean }) {
  return (
    <svg viewBox="0 0 104 84" width={width} height={height} aria-hidden style={{ opacity: dim ? 0.45 : 1 }}>
      <defs>
        <radialGradient id="beR" cx=".5" cy=".2" r=".9">
          <stop offset="0" stopColor="#FF7A57" /><stop offset="1" stopColor="#8E0E05" />
        </radialGradient>
      </defs>
      <rect x="4" y="10" width="96" height="66" rx="9" fill="url(#beR)" stroke="#FFD75E" strokeWidth="2.4" />
      <path d="M6 14l46 34 46-34" fill="none" stroke="#FFE9A3" strokeWidth="2.6" opacity=".9" />
      <circle cx="52" cy="52" r="15" fill="#FFD75E" stroke="#8a5f00" strokeWidth="2" />
      <text x="52" y="59" textAnchor="middle" fontSize="17" fontWeight="900" fill="#8a4a00">৳</text>
      {/* coin sparkles */}
      {!dim && [[18, 20], [88, 26], [26, 70], [80, 68]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.4" fill="#FFE9A3" opacity=".75" />
      ))}
    </svg>
  );
}

/** A golden egg on its red stand. */
export function GoldenEgg({ cracked = false, size = 62 }: { cracked?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 60 76" width={size} height={(size * 76) / 60} aria-hidden>
      <defs>
        <radialGradient id="eggG" cx=".38" cy=".32" r=".78">
          <stop offset="0" stopColor="#FFF6CE" /><stop offset=".45" stopColor="#FFD75E" /><stop offset="1" stopColor="#B57B00" />
        </radialGradient>
        <linearGradient id="standR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E03B22" /><stop offset="1" stopColor="#7A0D04" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="68" rx="24" ry="6" fill="url(#standR)" stroke="#FFD75E" strokeWidth="1.4" />
      <path d="M30 4c10 0 17 12 17 25S39 52 30 52 13 42 13 29 20 4 30 4z" fill="url(#eggG)" stroke="#8a5f00" strokeWidth="1.6" />
      <ellipse cx="24" cy="18" rx="5" ry="8" fill="#fff" opacity=".45" transform="rotate(-18 24 18)" />
      {cracked && (
        <path d="M14 30l7 4-5 5 8 3-4 6" fill="none" stroke="#7a4b00" strokeWidth="2" strokeLinecap="round" opacity=".85" />
      )}
    </svg>
  );
}

/** Gold laurel + crown banner used at the top of the prize page. */
export function CrownBanner({ label }: { label: string }) {
  return (
    <div className="relative flex items-center justify-center gap-1.5">
      <span className="absolute -inset-x-2 -top-2 bottom-0 rounded-t-2xl bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,197,61,.35),transparent_70%)]" />
      <LaurelCrown size={26} />
      <span className="relative bg-gradient-to-b from-[#FFF3C4] via-[#FFD75E] to-[#D89B08] bg-clip-text text-[17px] font-black tracking-wide text-transparent drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
        {label}
      </span>
      <span className="scale-x-[-1]"><LaurelCrown size={26} /></span>
    </div>
  );
}
