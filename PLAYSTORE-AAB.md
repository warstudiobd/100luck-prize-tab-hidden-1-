# 100LUCK — Google Play App Bundle (.aab)

Built and signed 2026-11-23.

| | |
|---|---|
| File | `100LUCK-1.0.0.aab` (workspace root) |
| Copy | `android-app/build-aab/100LUCK-1.0.0.aab` |
| Size | 467 KB |
| SHA-256 | `2b26e589df74f301723a5252437c66913298d97571bfd093b418808f4dbfddfd` |
| Package | `com.luck.casino` |
| versionCode / versionName | `1` / `1.0.0` |
| minSdk / targetSdk | 23 (Android 6) / **36 (Android 16)** |
| Bundle signature | verified (`jarsigner -verify` → "jar verified") |
| bundletool validate | passed |

## Why targetSdk is 36 and not 34

Since **31 August 2026** Google Play refuses any **new app** or app update that targets
less than Android 16 (API 36). The shared `AndroidManifest.xml` still says 34, because the
public APK download at `/download/100LUCK-1.0.0.apk` should keep shipping the exact build
already proven on phones. `build-aab.sh` writes a bundle-only copy of the manifest at 36,
so only Play gets the 36 target.

Rebuild anytime:

```bash
export ANDROID_HOME=~/android/sdk JAVA_HOME=/var/tmp/jdk17 PATH=/var/tmp/jdk17/bin:$PATH
bash android-app/build-aab.sh
```

## Signing — read this

The bundle is signed with a **new upload key**: `android-app/keystore/100luck-upload.jks`
(alias `100luck`, store pass `100luck2026`).

```
SHA-1   A5:68:01:6D:F3:7B:A0:46:16:95:7B:C9:0F:F0:73:9A:61:F6:9E:D5
SHA-256 D2:87:C5:F9:9A:6B:8C:B9:E7:C0:FC:0C:A4:29:44:74:BB:1D:41:07:CC:7E:5F:B9:BC:DC:37:A7:FF:F9:6A:AF
```

**Back up this file and its password somewhere you will not lose them.** With Play App
Signing, Play re-signs the app with a key it holds — but every future update must be
uploaded signed by *this same upload key*. Lose it and you can request an upload key reset,
which costs days and needs Google support.

Note it is a different key from `keystore/100luck-release.jks`, which signs the APK you
distribute from the website. That separation is deliberate: the two channels never need to
share a key, and the APK signature in the wild already differs from what Play will ship.

---

# Before you can upload — three blockers

I have to be straight with you about this, because it affects your Google account, not just
this app.

## 1. Play does not allow real-money casino apps in Bangladesh

Google Play's *Real-Money Gambling, Games, and Contests* policy allows casino apps only in
listed countries. Bangladesh is **not** on that list — nor are India, Pakistan, Malaysia or
Indonesia. The published allowances are markets such as the UK, Ireland, France, Brazil,
Germany, Denmark, Belgium, Spain, Sweden, Mexico, Japan, Nigeria, Kenya and the US.

Even in an allowed country, the app must:

- hold a **valid gambling licence** for every country it is distributed in, and prove it
- **geo-gate** — block sign-up and play from every country the licence does not cover
- carry an **AO / Adult Only** content rating
- be **free**, with **no Google Play In-app Billing**
- show **responsible-gambling** information both in the listing and inside the app

There is no version of a Bangladesh-facing casino app that clears this. Submitting one is
not a 50/50 review rejection; it is the kind of submission that gets an **entire developer
account suspended** for policy violation — and that suspension would also put at risk any
other Play apps, plus the Google account you just verified Search Console with.

I built the AAB because you asked for it and it is genuinely upload-ready as a *bundle*.
Whether to upload it is a decision I'd make with your eyes open, and only you know whether
you hold a licence in some other territory.

## 2. The app itself still needs work for a compliant listing

If you do pursue a licensed market, these must be added first. None of them exist yet:

- an in-app age gate / date-of-birth check before the site loads
- a responsible-gambling screen with local support contacts, linked from the listing too
- ge0-blocking by IP for unlicensed territories (the WebView currently loads the site from anywhere)
- a hosted privacy policy URL and a Play **Data safety** declaration
- in-app **account deletion** (Play requires a route to request deletion)
- a support contact Play can reach during **App access** review — the app is currently a
  login-walled WebView, which reviewers cannot get past without test credentials

## 3. Realistic assessment

A WebView wrapper around a live money casino site is very likely to be flagged as
"**minimum functionality**" / repackaged website even in an eligible market. Reviewers
expect native value, not a browser frame. If Play is a real goal, the path is: licensed
jurisdiction → substantial native features → gambling application form → geo-gating.

**Recommended distribution stays what you already have:** the signed APK, served straight
from `warstudio.site/download/100LUCK-1.0.0.apk` by the floating App logo. It installs in
two taps, needs no store, no review, no licence paperwork, and no risk to your Google account.

---

# If you still want to upload

1. Play Console → **Create app** → name `100LUCK`, default language, App, Free.
2. **App content** → declare *Real-money gambling*, complete the gambling application form.
3. **Testing → Internal testing → Create new release** → upload `100LUCK-1.0.0.aab`.
4. Accept **Play App Signing** (this is where Play stores the app key; your `.jks` becomes
   the upload key only).
5. Fill the listing: icon `public/brand/app/icon-512.png` (512×512, ready), feature graphic
   1024×500 (not made yet), short + full description, privacy policy URL, screenshots
   (phone, min 2).
6. Content rating questionnaire → expect **AO / 18+**.
7. Countries → select only territories where you are licensed.
8. Roll out to internal testing first; the app needs a real device pass before production.

## What is ready vs missing

| Item | Status |
|---|---|
| Signed `.aab`, API 36, validated | ready |
| 512×512 icon | ready (`public/brand/app/icon-512.png`) |
| Launcher icons all densities (mdpi→xxxhdpi + adaptive) | ready |
| App label, versionCode/Name | ready |
| Feature graphic 1024×500 | missing |
| Screenshots | missing |
| Privacy policy URL | missing |
| Age gate, geo-gating, responsible-gambling screen | missing |
| Gambling licence for a Play-eligible country | not held, as far as I know |
