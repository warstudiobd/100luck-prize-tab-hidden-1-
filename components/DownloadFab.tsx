"use client";
/**
 * DownloadFab — the floating app-download button.
 *
 * Bottom-right, directly above the tab bar. One tap = the APK starts downloading
 * (`<a download>` straight to /download/100LUCK-1.0.0.apk). No page, no prompt,
 * no store, no questions.
 *
 * It renders nothing at all when:
 *   • the page is opened *inside* the Android app (the user already has it), or
 *   • the browser offered a native install prompt — in that case it installs the
 *     PWA in place instead of pushing an APK nobody asked for.
 *
 * The header "APP" chip still reports here through `sonali7:open-app`.
 */
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { useLang } from "./lang";

const APK = "/download/100LUCK-1.0.0.apk";

export default function DownloadFab() {
  const { lang } = useLang();
  const [inside, setInside] = useState(false);
  const [native, setNative] = useState<any>(null);

  useEffect(() => {
    setInside(/100LUCKApp\//.test(navigator.userAgent));
    const onPrompt = (e: any) => { e.preventDefault(); setNative(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function tap() {
    /* a real install prompt is better than an APK file — take it when offered */
    if (native) {
      native.prompt();
      try { await native.userChoice; } catch { /* dismissed */ }
      setNative(null);
      return;
    }
    const a = document.createElement("a");
    a.href = APK;
    a.download = "100LUCK.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (inside) return null;

  return (
    <button onClick={tap}
      aria-label={lang === "bn" ? "100LUCK অ্যাপ ডাউনলোড করুন" : "Download the 100LUCK app"}
      title={lang === "bn" ? "অ্যাপ ডাউনলোড" : "Download app"}
      className="fixed bottom-[5.15rem] right-2.5 z-[45] flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-[#F5B800] bg-gradient-to-b from-[#ffe066] via-[#F5B800] to-[#c98f00] text-[#1a1300] shadow-[0_6px_20px_rgba(0,0,0,.55),0_0_0_3px_rgba(245,184,0,.18)] active:scale-95">
      <Smartphone size={24} strokeWidth={2.4} />
    </button>
  );
}
