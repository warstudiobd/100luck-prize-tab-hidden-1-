"use client";
/** Free deposit-earned red-envelope game. It never takes a wager or fee. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { useLang } from "../lang";
import { formatTakaCompact as tk } from "@/lib/format";
import { BigEnvelope } from "./PrizeArt";

export default function PrizeEnvelope() {
  const { lang } = useLang();
  const T = (en: string, bn: string) => lang === "bn" ? bn : en;
  const [available, setAvailable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/prizes/free-play", { cache: "no-store" }).then(x => x.json()).catch(() => null);
    if (r?.ok) setAvailable(Number(r.available?.envelope ?? 0));
  }, []);
  useEffect(() => { load(); }, [load]);

  const play = async () => {
    if (busy || available < 1) return;
    setBusy(true); setToast(null);
    try {
      const r = await fetch("/api/prizes/free-play", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "envelope" }),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 401) { setToast(T("Log in to play", "খেলতে লগইন করুন")); return; }
      if (!r.ok || !d?.ok) { setToast(lang === "bn" ? (d?.error_bn || d?.error || "খেলা যায়নি") : (d?.error || "Could not play")); return; }
      setReward(Number(d.prize_cents));
      setAvailable(Number(d.plays_available ?? 0));
    } catch { setToast(T("Network error", "নেটওয়ার্ক সমস্যা")); }
    finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_50%_0%,#5a0a20,#21030c_60%,#121212_100%)] pb-6">
      <div className="flex items-center justify-between px-3 pt-2">
        <Link href="/prizes" prefetch aria-label={T("Back", "পেছনে")} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80"><ChevronLeft size={16} /></Link>
        <p className="text-[13px] font-black tracking-wide text-[#FFE9A3]">{T("Red envelope", "লাল খাম")}</p>
        <Link href="/" prefetch aria-label={T("Close", "বন্ধ")} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/80"><X size={15} /></Link>
      </div>
      <div className="relative mt-12 flex items-end justify-center gap-2 px-4">
        <div aria-hidden className="absolute inset-x-6 top-4 h-28 rounded-full bg-[#FF4A3D]/25 blur-2xl" />
        <BigEnvelope width={92} height={74} />
        <div className="-mb-1"><BigEnvelope width={132} height={108} /></div>
        <BigEnvelope width={92} height={74} />
      </div>
      <div className="mx-4 mt-8 rounded-2xl border border-[#FFD75E]/25 bg-black/40 p-4 text-center">
        <p className="text-[12px] font-black text-[#FFE9A3]">{T("One free play per successful ৳500+ deposit", "৳৫০০+ প্রতিটি সফল ডিপোজিটে একটি ফ্রি খেলা")}</p>
        <p className="mt-1 text-[10px] text-white/50">{T("No fee or wager · maximum reward ৳6", "কোনো ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}</p>
        <p className="mt-3 text-[10px] font-bold text-white/70">{T(`${available} free play${available === 1 ? "" : "s"} ready`, `${available}টি ফ্রি খেলা প্রস্তুত`)}</p>
        <button onClick={play} disabled={busy || available < 1}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[13px] font-black text-white shadow-[0_4px_0_#8c2a05] disabled:opacity-45">
          {busy && <Loader2 size={15} className="animate-spin" />}{T("Play", "খেলুন")}
        </button>
      </div>
      {reward !== null && <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 px-6 text-center backdrop-blur-sm">
        <BigEnvelope width={150} height={120} /><p className="mt-2 text-[11px] font-black text-white/70">{T("You opened", "আপনি পেয়েছেন")}</p>
        <p className="gold-text text-[34px] font-black leading-none tabular-nums">{tk(reward)}</p>
        <p className="mt-1 text-[9px] text-white/45">{T("Free play · no fee or wager · maximum reward ৳6", "ফ্রি খেলা · কোনো ফি বা বাজি নেই · সর্বোচ্চ পুরস্কার ৳৬")}</p>
        <button onClick={() => setReward(null)} className="mt-4 h-10 w-44 rounded-full bg-gradient-to-b from-[#FF8A3D] to-[#E04E12] text-[12.5px] font-black text-white">{T("Continue", "চালিয়ে যান")}</button>
      </div>}
      {toast && <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center px-4" onClick={() => setToast(null)}><p className="rounded-xl border border-[#FFD75E]/40 bg-black/90 px-3 py-2 text-center text-[10.5px] font-bold text-[#FFE9A3]">{toast}</p></div>}
    </div>
  );
}
