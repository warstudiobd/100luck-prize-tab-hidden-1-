# Performance & support — v53

Live: **https://warstudio.site**

---

## 1. Support chat: vendor plugin removed (v53)

SaleSmartly is **gone from the codebase**, not hidden behind a flag:

| removed | what it was |
|---|---|
| `lib/support-chat.ts` | wrapper around the vendor JSSDK (`window.ssq`, `__ssc` licence, `chatOpen` queue) |
| `components/SupportChatLoader.tsx` | injected `https://plugin-code.salesmartly.com/...` into every page |
| `SupportView` live-chat branch | dead code that polled the widget's panel state |

Verified: `grep -r "salesmartly\|__ssc\|ssq"` over `app/ components/ lib/` returns nothing,
and no page loads a third-party script any more.

Support now runs entirely on our own rails:

| screen | source | notes |
|---|---|---|
| `/member/support` | `components/views/SupportView.tsx` | "Write to support" opens our ticket chat |
| ticket chat | `components/SupportChat.tsx` → `/api/chat` | 3 s poll, admin answers from the admin panel |
| header help | same ticket chat | — |

---

## 2. Lobby / game lag — what was actually wrong (v53)

Profiling (Chromium, 4× CPU throttle, 390×844, local prod build):

| metric | before v53 | after v53 |
|---|---|---|
| DOM nodes on home | **4,787** | **634** |
| lobby tiles rendered | **318** | **18** |
| page height | 14,053 px | 1,295 px |
| avg frame while scrolling | **69 ms** (≈14 fps) | **16.7 ms** (60 fps) |
| p95 frame | 152 ms | 21.6 ms |
| long tasks during scroll | **34** (2,746 ms total) | **0** |
| home load (4× CPU) | ~960 ms | ~740 ms |
| requests on first load | 76 | 52 |

Causes and fixes:

1. **The hot list was rendered twice, unpaged.** `mode === "HOT"` drew a "🔥 HOT GAMES"
   section *and* the category section under it — 300+ tiles, ~14k px of DOM. HOT is now a
   single paged section (`PAGE_SIZE` 18 phone / 36 desktop) with the same "Load more" button.
2. **Per-tile paint work.** Removed hover scaling, `backdrop-blur`, and the per-card
   `IntersectionObserver`; thumbnails are plain sized `next/image` (`width/height 160`,
   `quality 62`, lazy, `decoding=async`). Only the first row is eager.
3. **Tiles now sit in their own paint layer**: `.cv-tile` (`content-visibility:auto`,
   `contain:content`, `contain-intrinsic-size:auto 150px`) in `app/globals.css`, so off-screen
   tiles cost nothing to style/layout/paint and one tile's paint cannot invalidate its
   neighbours.
4. **Blur removal outside the grid.** Header, bottom nav, prize dock and the launch sheet
   scrim used `backdrop-blur` over a full-height list. All replaced with solid tints
   (`GameLaunchSheet` alone was ~90 ms/frame on a throttled phone).
5. **Game launch path unchanged and fast**: tile tap → Play/Free Trial sheet in **192 ms**;
   the sheet contacts `/api/games/launch` only on the button press (1.5 s to mounted iframe
   on a throttled connection, provider-dependent).

Image pipeline: `next.config.js` – `deviceSizes [360,414,480,640,828,1080,1200]`,
`imageSizes [96,128,160,192,256,320,384]`, WebP, `minimumCacheTTL 604800`.
(A 509 KB source PNG is served at 6.8 KB.)

### Re-measuring

```bash
node /tmp/qa/perf53.mjs     # home load, scroll frames, long tasks (needs port 3000 up)
node /tmp/qa/launch.mjs     # tile tap → sheet, Load more
node /tmp/qa/trial.mjs      # Free Trial → iframe mount
```

---

## 3. Unused files removed (v53)

| removed | why |
|---|---|
| `lib/support-chat.ts`, `components/SupportChatLoader.tsx` | vendor plugin teardown |
| `components/AppDownloadFab.tsx` | superseded by `components/DownloadFab.tsx` (one-tap APK) |
| `public/brand/emblem.jpg`, `icon-192.jpg`, `icon-512.jpg`, `icon-circle.png` | never referenced; the live icons are `public/brand/app/*` |
| old `site*.tar.gz` / `admin*.tar.gz` deploy artifacts | one live artifact kept (`site53.tar.gz`) |
| 260 archived QA screenshots | moved to `qa-archive/` (keep only current-proof shots in the repo root) |

Kept on purpose: `public/thumbs/*.svg` and `/api/games/sync` fallbacks, `public/providers/*`
(withdraw logos), the `/get-app` page (shareable link, no longer in the player UI), and
`tailwind.config.ts` (required config, flagged by naive scanners).
