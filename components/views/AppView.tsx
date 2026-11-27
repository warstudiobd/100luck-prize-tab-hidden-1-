"use client";
/**
 * AppView — the public "download the app" tab (/get-app).
 *
 * Open to everyone, signed in or not: the APK is served from our own domain, so a
 * new visitor can install the app before they even register.
 *
 *   • Download APK          — signed Android build, 1-tap
 *   • Install as web app    — the browser's own install prompt, when offered
 *   • iPhone path           — Share → Add to Home Screen
 *   • QR code               — scan from a phone on desktop
 *   • what's inside / why it is safe
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Download, Smartphone, ShieldCheck, Info, Share, Check,
  Wallet, Gift, Headset, Zap, RefreshCw,
} from "lucide-react";
import { useLang } from "@/components/lang";

const APK = "/download/100LUCK-1.0.0.apk";
const APK_NAME = "100LUCK-1.0.0.apk";
const APK_VERSION = "1.0.0";
const APK_SIZE = "478 KB";

/**
 * Static QR for https://warstudio.site/get-app — precomputed by scripts/make-qr.mjs so the
 * app never ships a QR library. 29×29 modules, EC level L, 4 hex chars per 16 bits.
 */
const QR_GET_APP: { size: number; rows: string[] } = {
  size: 29,
  rows: ["00000000","00000000","3faccfe0","20a22820","2ebc0ba0","2ebfaba0","2e956ba0","20b8a820","3faaafe0","000ce000","338a45e0","2164e340","2e9e7780","2116c4c0","30e619e0","3f2f7240","018cd780","0e065ec0","34d03f80","0035e200","3f96aa00","20bea3e0","2eaabfc0","2e849ce0","2e97a940","20a297c0","3fba50e0","00000000","00000000"],
};

function QrCodeBlock() {
  const { size, rows } = QR_GET_APP;
  const quiet = 2;
  const total = size + quiet * 2;
  return (
    <svg viewBox={`0 0 ${total} ${total}`} className="h-[118px] w-[118px] rounded-xl bg-white p-1.5" role="img"
      aria-label="QR code — scan to open the 100LUCK app download page">
      <rect width={total} height={total} fill="#fff" />
      {rows.map((hex, r) =>
        hex.split("").map((h, i) => {
          const nib = parseInt(h, 16);
          return [0, 1, 2, 3].map((b) => {
            const c = i * 4 + b;
            if (c >= size) return null;
            const on = (nib >> (3 - b)) & 1;
            return on ? <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#121212" /> : null;
          });
        })
      )}
    </svg>
  );
}

export default function AppView() {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [deferred, setDeferred] = useState<any>(null);
  const [ios, setIos] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    /* if we were opened from inside the app, say so instead of offering an install */
    setStarted(/100LUCKApp\//.test(navigator.userAgent));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const FEATURES = [
    { icon: Wallet, en: "Same wallet, same account", bn: "একই ওয়ালেট, একই অ্যাকাউন্ট" },
    { icon: Zap, en: "Opens straight into the lobby — no browser bar", bn: "সরাসরি লবিতে খোলে — ব্রাউজার বার নেই" },
    { icon: Gift, en: "Prizes, wheel and red envelope built in", bn: "পুরস্কার, হুইল ও লাল খাম আগেই আছে" },
    { icon: Headset, en: "Support ticket one tap away", bn: "সাপোর্ট টিকিট এক ট্যাপে" },
  ];

  return (
    <div className="px-3 pb-8 pt-2">
      <div className="flex items-center gap-2">
        <Link href="/" prefetch aria-label={T("Back", "পেছনে")}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[.04] text-white/70 active:scale-90">
          <ChevronLeft size={17} />
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#F5B800]/35 bg-[#F5B800]/10 text-[#F5B800]">
          <Smartphone size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-black leading-none text-white">{T("Get the app", "অ্যাপ নিন")}</h1>
          <p className="mt-0.5 text-[9px] text-white/40">{T("Android APK · free · 478 KB", "অ্যান্ড্রয়েড APK · ফ্রি · ৪৭৮ KB")}</p>
        </div>
      </div>

      {/* ── APK card ─────────────────────────────────────────────── */}
      <div className="card-metal mt-3 overflow-hidden rounded-2xl p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-[#ffe066] to-[#b87e00] text-black shadow-gold">
            <Smartphone size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-white">100LUCK Android</p>
            <p className="text-[9px] font-semibold text-white/45">
              {T(`Version ${APK_VERSION} · ${APK_SIZE} · Android 6.0+`, `ভার্সন ${APK_VERSION} · ${APK_SIZE} · Android 6.0+`)}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[8.5px] font-bold text-emerald-400">
              <Check size={9} />{T("Signed build · no extra permissions", "সাইন করা বিল্ড · অতিরিক্ত অনুমতি নেই")}
            </p>
          </div>
        </div>

        {started ? (
          <div className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 text-[12px] font-black text-emerald-300">
            <Check size={16} />{T("You are using the app", "আপনি অ্যাপটি ব্যবহার করছেন")}
          </div>
        ) : (
          <>
            <a href={APK} download="100LUCK.apk"
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#ffe066] via-[#F5B800] to-[#b87e00] text-[13.5px] font-black text-black active:scale-[.99]">
              <Download size={17} />{T("Download APK", "APK ডাউনলোড করুন")}
            </a>
            <p className="mt-1 text-center text-[8px] font-semibold text-white/35">
              {APK_NAME} · {T("direct from our server, no store needed", "সরাসরি আমাদের সার্ভার থেকে, স্টোর লাগবে না")}
            </p>
          </>
        )}

        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2.5">
          <QrCodeBlock />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-black text-white">{T("On a computer?", "কম্পিউটারে আছেন?")}</p>
            <p className="mt-0.5 text-[8.5px] leading-snug text-white/50">
              {T("Scan this with your phone camera and the download page opens there.",
                 "ফোনের ক্যামেরায় স্ক্যান করুন — ডাউনলোড পেজটি ফোনে খুলবে।")}
            </p>
          </div>
        </div>

        {deferred && (
          <button onClick={async () => { deferred.prompt(); try { await deferred.userChoice; } catch {} setDeferred(null); }}
            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[.05] text-[11px] font-black text-white/80">
            <Download size={13} />{T("Install as web app instead", "ওয়েব অ্যাপ হিসেবে ইনস্টল করুন")}
          </button>
        )}
      </div>

      {/* ── install steps ───────────────────────────────────────── */}
      <div className="mt-2 rounded-2xl border border-amber-400/25 bg-amber-400/[.06] p-3">
        <p className="flex items-center gap-1.5 text-[10.5px] font-black text-amber-300">
          <Info size={12} />{T("First time installing", "প্রথমবার ইনস্টল করছেন?")}
        </p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[9px] leading-snug text-white/60">
          <li>{T("Tap Download APK — the file saves to your phone.", "APK ডাউনলোড করুন — ফাইলটি ফোনে সেভ হবে।")}</li>
          <li>{T("Open it; Android asks to allow installs from this browser — tap Settings → Allow.", "ফাইলটি খুলুন; ব্রাউজার থেকে ইনস্টল করার অনুমতি চাইবে — Settings → Allow চাপুন।")}</li>
          <li>{T("Tap Install, then open 100LUCK from your app drawer.", "Install চাপুন, তারপর অ্যাপ লিস্ট থেকে 100LUCK খুলুন।")}</li>
        </ol>
      </div>

      {/* ── what's inside ──────────────────────────────────────── */}
      <div className="mt-2 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-white/55">{T("What you get", "কী পাবেন")}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {FEATURES.map(({ icon: Icon, en, bn }) => (
            <div key={en} className="flex items-start gap-1.5 rounded-xl border border-white/8 bg-black/25 p-2">
              <Icon size={13} className="mt-0.5 shrink-0 text-[#F5B800]" />
              <span className="text-[8.5px] font-semibold leading-snug text-white/65">{T(en, bn)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── iPhone / no sideload ───────────────────────────────── */}
      <div className="mt-2 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-white">
          <Share size={12} className="text-[#F5B800]" />{T("iPhone, or prefer no APK?", "আইফোন, বা APK ছাড়া চান?")}
        </p>
        <p className="mt-1 text-[9px] leading-snug text-white/55">
          {ios
            ? T("In Safari tap Share → Add to Home Screen. It opens full-screen like an app.", "Safari-তে Share → Add to Home Screen চাপুন। অ্যাপের মতোই ফুল-স্ক্রিনে খুলবে।")
            : T("In Chrome tap the ⋮ menu → Install app / Add to Home screen. It opens full-screen like an app.", "Chrome-এ ⋮ মেনু → Install app / Add to Home screen চাপুন। অ্যাপের মতোই ফুল-স্ক্রিনে খুলবে।")}
        </p>
      </div>

      {/* ── safety ─────────────────────────────────────────────── */}
      <div className="mt-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-white">
          <ShieldCheck size={13} className="text-emerald-400" />{T("Safe to install", "নিরাপদে ইনস্টল করুন")}
        </p>
        <ul className="mt-1 space-y-1 text-[9px] leading-snug text-white/55">
          <li>· {T("The app is the website — same account, same wallet, same games.", "অ্যাপটি আসলে ওয়েবসাইটটিই — একই অ্যাকাউন্ট, ওয়ালেট ও গেম।")}</li>
          <li>· {T("Internet permission only — no contacts, storage or location.", "শুধু ইন্টারনেট অনুমতি — কনট্যাক্ট, স্টোরেজ বা লোকেশন নয়।")}</li>
          <li>· {T("We never ask for your password or withdrawal PIN inside the app.", "অ্যাপে আমরা কখনো পাসওয়ার্ড বা উইথড্রয়াল PIN চাই না।")}</li>
        </ul>
      </div>

      <div className="mt-2 flex items-center justify-center gap-1 text-[8px] font-semibold text-white/30">
        <RefreshCw size={9} />{T("The app updates itself — no need to reinstall when the site changes.", "অ্যাপ নিজেই আপডেট হয় — সাইট বদলালে আবার ইনস্টল করতে হয় না।")}
      </div>
    </div>
  );
}
