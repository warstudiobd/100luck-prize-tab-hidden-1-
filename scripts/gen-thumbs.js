// Generates unique, offline-safe SVG game thumbnails into public/thumbs/
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..", "public", "thumbs");
fs.mkdirSync(out, { recursive: true });

const games = [
  ["jili_super_ace",          "SUPER ACE",        "A",  "#F5B800", "#7A1E1E", "♠️", true ],
  ["jili_fortune_gems",       "FORTUNE GEMS",     "💎", "#22d3ee", "#1e1b4b", false],
  ["jili_money_coming",       "MONEY COMING",     "¥",  "#FDE047", "#3b0764", false],
  ["jili_boxing_king",        "BOXING KING",      "🥊", "#fb7185", "#450a0a", false],
  ["jili_super_elements",     "SUPER ELEMENTS",   "🔥", "#fb923c", "#431407", false],
  ["jili_super_elements_2",   "SUPER ELEMENTS 2", "⚡", "#facc15", "#1c1917", false],
  ["fa_chai_chinese_new_year","CHINESE NEW YEAR", "🧧", "#ef4444", "#450a0a", false],
  ["fa_chai_golden_panther",  "GOLDEN PANTHER",   "🐆", "#F5B800", "#292524", true ],
  ["spribe_aviator",          "AVIATOR",          "✈️", "#f87171", "#0f172a", false],
  ["jili_mega_fishing",       "MEGA FISHING",     "🐟", "#38bdf8", "#082f49", false],
  ["fa_chai_shark_hunter",    "SHARK HUNTER",     "🦈", "#2dd4bf", "#042f2e", false],
  ["fa_chai_live_baccarat",   "LIVE BACCARAT",    "🎴", "#e879f9", "#3b0764", false],
  ["fa_chai_live_roulette",   "LIVE ROULETTE",    "🎡", "#fca5a5", "#111827", false],
  ["fa_chai_texass_holdem",   "TEXAS HOLDEM",     "♠️", "#a3e635", "#1a2e05", false],
  ["spribe_hilo",             "HI-LO",            "🃏", "#c4b5fd", "#2e1065", false],
  ["fa_chai_sportsbook",      "SPORTSBOOK",       "⚽", "#4ade80", "#052e16", false],
  ["jili_cricket_fever",      "CRICKET FEVER",    "🏏", "#fdba74", "#431407", false],
];

function svg([code, title, glyph, accent, deep]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="${deep}"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE066"/><stop offset=".45" stop-color="#F5B800"/><stop offset=".55" stop-color="#8a6500"/><stop offset="1" stop-color="#FFE066"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2b2b"/><stop offset=".5" stop-color="#161616"/><stop offset="1" stop-color="#232323"/>
    </linearGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.6" fill="${accent}" opacity="0.22"/>
    </pattern>
  </defs>
  <rect width="300" height="300" rx="22" fill="url(#bg)"/>
  <rect width="300" height="300" rx="22" fill="url(#dots)"/>
  <rect x="10" y="10" width="280" height="280" rx="16" fill="none" stroke="url(#gold)" stroke-width="4" opacity="0.95"/>
  <rect x="16" y="16" width="268" height="268" rx="12" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2"/>
  <circle cx="150" cy="128" r="72" fill="#000" opacity="0.38"/>
  <circle cx="150" cy="128" r="72" fill="none" stroke="url(#gold)" stroke-width="3" opacity="0.85"/>
  <text x="150" y="152" font-size="84" text-anchor="middle">${glyph}</text>
  <text x="150" y="238" font-size="17" font-weight="800" text-anchor="middle" fill="url(#gold)" font-family="Arial Black, Arial" letter-spacing="1.5">${title}</text>
  <text x="150" y="262" font-size="9" text-anchor="middle" fill="#ffffff" opacity="0.55" font-family="Arial" letter-spacing="3">SONALI7 ORIGINAL</text>
</svg>`;
}
for (const g of games) fs.writeFileSync(path.join(out, g[0] + ".svg"), svg(g));
console.log("wrote", games.length, "thumbnails");
