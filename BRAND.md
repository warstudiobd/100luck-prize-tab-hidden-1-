# Brand logo replacement

New logo source: `uploads/1795658572977.jpg` (1059×992 JPEG, white background).
Processed into a transparent master, then rendered at every size the project needs.

## The one technical problem, and how it was solved

The source has a **white background**, but the artwork also contains **white playing-card
faces and white highlights**. A naive "delete all white pixels" erases the cards.

Solution: flood-fill the near-white region **from the image border only**, using connected-
component labelling, then dilate by 1 px to eat the anti-aliased halo. White areas enclosed
by the artwork are preserved. Result: 50% of the image became transparent, 6.9% of white
was correctly *kept* inside the badge.

## Files generated

| File | Size | Purpose |
|---|---|---|
| `public/brand/logo.png` | 800×622, 104 KB | full logo, transparent — Open Graph, Twitter, schema.org `logo` |
| `public/brand/logo.webp` | 800×622, 104 KB | same, modern format |
| `public/brand/emblem-96.png` | 96 | header emblem (replaces deleted `emblem-96.jpg`) |
| `public/brand/emblem-192.png` | 192 | retina header |
| `public/brand/emblem-288.png` | 288 | 3× retina |
| `public/brand/app/icon-192.png` | 192 | PWA icon, dark bg |
| `public/brand/app/icon-512.png` | 512 | PWA icon, dark bg |
| `public/brand/app/maskable-192.png` | 192 | Android safe-zone (logo at 62%) |
| `public/brand/app/maskable-512.png` | 512 | Android safe-zone |
| `public/brand/apple-icon.png` | 180 | iOS home screen, opaque (iOS ignores alpha) |
| `public/favicon.ico` | 16/32/48 | browser tab |
| `public/brand/favicon-96.png` | 96 | modern browsers |
| `admin/public/favicon.png` | 192 | admin tab / iOS |
| `admin/public/favicon-64.png` | 64 | admin tab |
| `admin/public/brand/emblem.png` | 256 | admin sidebar |
| `android-app/res/mipmap-*/ic_launcher.png` | 48–192 | launcher (all 5 densities) |
| `android-app/res/mipmap-*/ic_launcher_foreground.png` | 108–432 | adaptive icon foreground |
| `android-app/res/mipmap-*/ic_launcher_background.png` | 108–432 | adaptive icon background |

## Files deleted

| Deleted | Why |
|---|---|
| `public/brand/emblem-96.jpg` | replaced by `emblem-96.png` (needs transparency) |
| `admin/public/brand/emblem.jpg` | replaced by `emblem.png` |
| `admin/public/favicon.svg` | old "100 / LUCK" text placeholder |

## Code changed

- `components/Header.tsx` — src → `emblem-96.png`; the old `rounded-full` + `border-[1.5px]`
  gold ring was replaced by `rounded-[7px]` + a soft 45% border. Reason: at 26 px the heavy
  gold circle closed around the artwork and the logo read as a blank gold coin. Tested four
  variants at 26 px before choosing.
- `app/layout.tsx` — added `/favicon.ico` to `icons`; OG + Twitter + schema.org logo now
  point at the full `logo.png` instead of the 512 icon.
- `admin/index.html` — favicon links → PNG.
- `admin/src/App.tsx` + `styles.css` — `emblem.png`, `object-fit: contain`.
- `android-app/res/**` — all launcher icons, foreground and background regenerated.

## Android artifacts rebuilt

Both re-signed with the existing keys (cert SHA-256 `389d7f51…`):

| Artifact | Size | SHA-256 |
|---|---|---|
| `public/download/100LUCK-1.0.0.apk` | 325,396 B | `f313bab6702d2224529ad9fd8f747c5f1e3f49fb5f369ba8cd702020d22ad2c5` |
| `100LUCK-1.0.0.aab` | 316,119 B | `40020d3c21a7fe874c32baca84d909924292cd26ce5d65eafa6c01c938cf2bfa` |

Verified: the icon extracted from inside both packages is the new artwork.

## Verification

- `npx tsc --noEmit` — clean
- `npm run build` — compiled
- All 16 brand assets return **200**; old `emblem-96.jpg` correctly **404**
- 11/11 pages pass, 0 broken images, 0 console errors, **no 4xx/5xx**
- e2e 12/12 (login, game launch, deposit, withdraw, prizes, profile)
- admin `npm run build` → new favicons in `dist/`

## Note on the build environment

The Android SDK had been wiped from the sandbox, so it was reinstalled to `/tmp/sdk`
(not persisted). The bundled `d8` in build-tools 34 crashes with JDK 21
(`NullPointerException: String.length()`); **build-tools 36 works**. If you rebuild the APK,
use `ANDROID_HOME` with build-tools 36 + platform 36 and JDK 21.
