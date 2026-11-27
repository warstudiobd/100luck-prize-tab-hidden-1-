# 100LUCK — web + Android app

Two things shipped together: the player site now works on **desktop and mobile**, and there is a
**signed Android APK** that opens the same site as an app.

- Site: **https://warstudio.site** (deployment `dpl_J71PXP44X4zgpwgfMYqGx1xZfkns`)
- App download page: **https://warstudio.site/get-app**
- APK: **https://warstudio.site/download/100LUCK-1.0.0.apk**
  (backup copy: Drive `1pOeXQIgAv9FusgCIzW7RR-m6h0xH2MPv`)

---

## 1. Responsive web

Breakpoints follow Tailwind: everything below `lg` (1024px) is the original phone layout, so
phones and the app look exactly as before. At `lg` and up the shell widens.

| area | mobile (<1024px) | desktop (≥1024px) |
|---|---|---|
| shell width | 480px centred frame | **1180px** centred, no side borders |
| header | two compact rows | same rows, full 1180px content width |
| game lobby | 3 columns + 58px icon rail | **6 columns** + 190px labelled category rail (sticky) |
| quick actions (Support / Cashback / Agent / Rewards) | 4 tiles, edge to edge | 4 tiles, capped at 760px, larger gaps |
| prize hub | stacked cards | 2-up card grid |
| deposit / withdraw | single column | single column with wide pay rails (3 gateways in a row) |
| bottom tab bar | 6 tabs (Home, Deposit, Promotion, Withdraw, Member, **App**), 520px | 6 tabs centred, 760px |
| game launcher | full-screen | 480px portrait frame, rounded, on a dark backdrop |
| decorative side text | hidden | very faint vertical "100LUCK / ১০০লাক" watermark either side |

Verified at 1440×900: no horizontal scroll on `/`, `/prizes`, `/prizes/spin`, `/deposit`,
`/member`, `/member/support` (`scrollWidth == clientWidth == 1440`), and at 390×844 the layout
is identical to the shipped mobile design.

Screenshots: `qa-web-desktop.png`, `qa-web-mobile.png`, `qa-web-{home,prizes,deposit,member,support,spin}.png`.

### PWA bits (also what Android needs)
- `app/manifest.json` — id/scope/start_url, `display: standalone`, portrait, maskable +
  any-purpose icons, and three shortcuts (Deposit, Prizes, Support).
- `app/layout.tsx` — apple-mobile-web-app tags, icon links, `viewport-fit: cover` so the app
  draws under the status bar; the site keeps using `env(safe-area-inset-*)`.
- Icons generated from `public/brand/emblem.jpg` into `public/brand/app/`
  (`icon-192/512`, `maskable-192/512`, `adaptive-foreground-432`).

---

## 2. Android APK

### What it is
A native shell (single `Activity` + `WebView`) around `https://warstudio.site/`. Deliberately
**not** a Trusted Web Activity: no Digital Asset Links file is needed, so there is no silent
blank-screen failure mode if the domain verification is missing. The site stays server-side, so
every web deploy is instantly in the app — no store update for content changes.

```
package        com.luck.casino
versionName    1.0.0   (versionCode 1)
minSdk         23 (Android 6.0)      targetSdk 34 (Android 14)
size           478 KB
signing        v1 + v2 + v3, self-signed release keystore
sha256         389d7f51e85fd09573406501edd7c9466fabb61d334f0a6999dc89a1be05c3b2
permissions    INTERNET, ACCESS_NETWORK_STATE  (nothing else)
```

### Behaviour
- Opens full-screen, portrait, edge-to-edge with a `#0f0f0f` status bar and `#161616` nav bar.
- **Stays inside the app** for any `warstudio.site` URL (login, cashier, prizes, support).
- **Opens outside** for everything else in the phone's browser or app — payment pages, bKash /
  Nagad app hand-offs (`tel:`, `mailto:`), socials. That keeps the app free of third-party
  login pages inside a WebView, which Google Play and the payment gateways require.
- Back button walks the site's history; at the root it asks *"Close 100LUCK?"* instead of
  quitting silently.
- Cookies + localStorage are shared and persisted, so the player stays logged in.
- If there is no connection, a Bangla + English "No internet — Retry" screen appears instead of
  Chrome's error page.
- `100LUCKApp/1.0` is appended to the user agent so the site can tell app traffic apart.

### Source layout (`android-app/`)
```
AndroidManifest.xml              manifest (package, permissions, portrait, launcher intent)
src/com/luck/casino/MainActivity.java   the whole app (WebView, nav rules, offline view)
res/values/{strings,styles,colors}.xml  label, theme, brand colours
res/mipmap-*/                    launcher icons + adaptive icon layers (generated)
res/mipmap-anydpi-v26/ic_launcher.xml   adaptive icon
keystore/100luck-release.jks     release keystore — KEEP THIS, see below
build.sh                         one-command build (aapt2 → javac → d8 → zipalign → apksigner)
build/100LUCK-1.0.0.apk          the signed APK
```

### Rebuild after changing the icon or the Java
```bash
# on a machine with JDK 17+ and the Android SDK (build-tools 34, platform 34)
export ANDROID_HOME=$HOME/android/sdk
bash android-app/build.sh
# → android-app/build/100LUCK-<version>.apk
```
On this sandbox the toolchain lives at `/var/tmp/jdk17` and `~/android/sdk`:
```bash
export JAVA_HOME=/var/tmp/jdk17 PATH=/var/tmp/jdk17/bin:$PATH ANDROID_HOME=$HOME/android/sdk
bash android-app/build.sh
cp android-app/build/100LUCK-*.apk public/download/     # then redeploy so /get-app serves it
```

### Changing the version
Bump `android:versionCode` / `android:versionName` in `android-app/AndroidManifest.xml`,
rename the file in `public/download/`, and update the three constants at the top of
`app/get-app/page.tsx`.

### Publishing to Google Play
The Play Console **rejects APKs that are updated without the same signing key**, and it wants an
**AAB**. Two things to do before a store upload:

1. **Keep `android-app/keystore/100luck-release.jks` safe** (password `100luck2026`, alias
   `100luck`). If it is lost, the app can never be updated on Play under the same listing.
2. Produce an AAB. `bundletool` would not accept a hand-assembled module here, so the reliable
   route is Gradle/Android Studio: import `android-app/` into a Gradle project
   (`com.android.application`, `signingConfigs` pointing at the same keystore) and run
   `./gradlew bundleRelease`. The Gradle file is ~20 lines; the resources, manifest and Java are
   already in the layout Gradle expects.
   Alternatively enrol in **Play App Signing** and upload the APK-derived bundle — Google then
   holds the upload key and re-signs.

Play policy notes for a casino app: real-money gambling apps are **not allowed** on Google Play
in most countries and never for Bangladesh, so plan on direct APK distribution (what `/get-app`
does now) or a store that accepts gambling. The APK itself is fine to sideload and share.

---

## 3. Distribution — one floating logo, one tap

There is **no App tab and no extra menu**. The only thing on the player screens is the small
gold phone logo floating at the bottom-right, right above the tab bar (`components/DownloadFab.tsx`).

- **Tap it → the APK downloads immediately.** No page, no store, no prompt, no extra steps.
  It is an `<a download>` to `/download/100LUCK-1.0.0.apk`, served from our own domain with the
  `application/vnd.android.package-archive` content type.
- It shows on **every** player screen (home, deposit, promotion, withdraw, member, prizes) and
  sits clear of the tab bar and the prize dock.
- The header **APP** chip triggers the same instant download.
- It hides itself in two cases only: when the page is opened **inside the Android app**
  (the visitor already has it — detected from the `100LUCKApp/1.0` user agent), and when the
  browser offers its own install prompt, where installing the PWA in place is the better tap.
- `/get-app` still exists as a plain, shareable link with the same download button, the install
  steps and the QR code — nothing links to it from the player UI any more.

## 4. Still open
- Play Console upload needs the AAB (see above) — say the word and I'll do the Gradle wrapper.
- iOS: no IPA here (needs a Mac + Apple signing). `/get-app` gives the Add-to-Home-Screen path.
- The app inherits the site's support setup, i.e. SaleSmartly chat is currently **hidden**
  (the SaleSmartly plugin was deleted from the code in v53 — no third-party script); support runs through
  `/member/support` and the ticket chat.
