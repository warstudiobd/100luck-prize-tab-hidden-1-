"use client";
/**
 * উত্তোলন রেকর্ড — withdrawal records, following the 499bet record screens:
 * আজ / গতকাল / ৭ দিন tabs, a ব্যাংক/গেটওয়ে filter, and one card per request
 * showing the request reference, requested/received amounts and status.
 *
 * Every row is a real cashier_requests row. Nothing is synthesised: a request
 * that is still PENDING says so, and "প্রাপ্ত পরিমাণ" stays "—" until the admin
 * has actually approved it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Copy, Inbox, Loader2 } from "lucide-react";
import { useLang } from "../lang";
import { formatTaka } from "@/lib/format";
import type { CashierRequestRow } from "@/lib/types";

type Range = "today" | "yesterday" | "7d";

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { bn: string; en: string; cls: string }> = {
    PENDING: { bn: "নতুন", en: "New", cls: "text-[#F5B800] bg-[#F5B800]/12 border-[#F5B800]/40" },
    APPROVED: { bn: "সফল", en: "Paid", cls: "text-emerald-400 bg-emerald-400/12 border-emerald-400/40" },
    REJECTED: { bn: "বাতিল", en: "Rejected", cls: "text-red-400 bg-red-400/12 border-red-400/40" },
  };
  const { lang } = useLang();
  const m = map[s] ?? { bn: s, en: s, cls: "text-white/60 bg-white/10 border-white/20" };
  return <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${m.cls}`}>{lang === "bn" ? m.bn : m.en}</span>;
}

export default function WithdrawRecordsView({ showToast, onBack, goBind }: {
  showToast: (m: string) => void;
  onBack: () => void;
  goBind: () => void;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [range, setRange] = useState<Range>("today");
  const [channel, setChannel] = useState<string>("ALL");
  const [rows, setRows] = useState<CashierRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/cashier/history?type=WITHDRAW&range=${range}`, { cache: "no-store" })
      .then(r => r.json()).catch(() => null);
    setRows(r?.ok ? r.requests : []);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const channels = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.channel)))], [rows]);
  const shown = useMemo(() => (channel === "ALL" ? rows : rows.filter(r => r.channel === channel)), [rows, channel]);

  const totals = useMemo(() => {
    const requested = shown.reduce((s, r) => s + (r.status !== "REJECTED" ? Number(r.amount_cents) : 0), 0);
    const paid = shown.reduce((s, r) => s + (r.status === "APPROVED" ? Number(r.amount_cents) : 0), 0);
    return { requested, paid };
  }, [shown]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToast(T("Copied", "কপি হয়েছে")); }
    catch { showToast(T("Copy failed — long-press instead", "কপি হয়নি — চেপে ধরে কপি করুন")); }
  };

  const rangeLabel = range === "today" ? T("today", "আজ") : range === "yesterday" ? T("yesterday", "গতকাল") : T("last 7 days", "৭ দিন");

  return (
    <div className="pb-[92px]">
      {/* title row */}
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Back", "ফিরে যান")}>
          <ChevronLeft size={19} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-black tracking-wide text-white">{T("Withdrawal records", "উত্তোলন রেকর্ড")}</h1>
        <button onClick={goBind} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-[#F5B800] active:scale-90" aria-label={T("Bound wallets", "বাঁধা ওয়ালেট")}>
          <ClipboardList size={17} />
        </button>
      </div>

      {/* আজ / গতকাল / ৭ দিন */}
      <div className="grid grid-cols-3 border-b border-white/10">
        {(["today", "yesterday", "7d"] as Range[]).map(r => {
          const on = range === r;
          const label = r === "today" ? T("Today", "আজ") : r === "yesterday" ? T("Previous", "গতকাল") : T("7 days", "৭ দিন");
          return (
            <button key={r} onClick={() => setRange(r)}
              className={`relative py-2.5 text-[12.5px] font-bold transition-colors ${on ? "text-[#F5B800]" : "text-white/45"}`}>
              {label}
              {on && <span className="absolute bottom-0 left-1/2 h-[2.5px] w-10 -translate-x-1/2 rounded-t bg-[#F5B800]" />}
            </button>
          );
        })}
      </div>

      {/* quick filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
        {channels.map(c => {
          const on = channel === c;
          return (
            <button key={c} onClick={() => setChannel(c)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[10.5px] font-bold ${on ? "border-[#F5B800] bg-[#F5B800]/12 text-[#F5B800]" : "border-white/12 text-white/55"}`}>
              {c === "ALL" ? T("All", "সব") : c}
            </button>
          );
        })}
        <span className="ml-auto shrink-0 rounded-md border border-white/12 px-2 py-1 text-[9px] font-bold text-white/45">
          {rangeLabel} · {shown.length}
        </span>
      </div>

      {/* totals strip */}
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-white/8 bg-[#1B1B1B] px-3 py-2">
        <div className="flex-1">
          <p className="text-[8px] font-bold uppercase tracking-wider text-white/35">{T("Requested", "অনুরোধ")}</p>
          <p className="text-[12px] font-black tabular-nums text-[#F5B800]">{formatTaka(totals.requested)}</p>
        </div>
        <div className="h-6 w-px bg-white/10" />
        <div className="flex-1">
          <p className="text-[8px] font-bold uppercase tracking-wider text-white/35">{T("Paid out", "প্রাপ্ত")}</p>
          <p className="text-[12px] font-black tabular-nums text-emerald-400">{formatTaka(totals.paid)}</p>
        </div>
      </div>

      {/* records */}
      <div className="space-y-2 px-3">
        {loading && (
          <p className="flex items-center justify-center gap-1.5 py-10 text-[10px] text-white/35">
            <Loader2 size={13} className="animate-spin" /> {T("Loading records…", "রেকর্ড লোড হচ্ছে…")}
          </p>
        )}

        {!loading && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[.03]">
              <Inbox size={34} className="text-white/25" strokeWidth={1.4} />
              <span className="absolute -right-1 -top-1 text-[13px]">✨</span>
            </span>
            <p className="text-[13px] font-black text-white/55">{T("No data", "কোন ডেটা নেই")}</p>
            <p className="px-6 text-center text-[9.5px] leading-snug text-white/30">
              {T(`No withdrawal requests ${rangeLabel}.`, `${rangeLabel} কোনো উত্তোলনের অনুরোধ নেই।`)}
            </p>
          </div>
        )}

        {!loading && shown.map(r => (
          <article key={r.id} className="rounded-xl border border-white/8 bg-[#1B1B1B] p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-black text-white">{r.channel} {T("withdrawal", "উত্তোলন")}</p>
              <StatusPill s={r.status} />
            </div>
            <p className="mt-0.5 text-[9px] tabular-nums text-white/35">
              {new Date(r.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>

            <div className="mt-1.5 space-y-1 rounded-lg bg-white/[.035] px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] text-white/45">{T("Request ref", "অনুরোধ রেফ")}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-white/80">
                  {String(r.id).padStart(12, "0")}
                  <button onClick={() => copy(String(r.id).padStart(12, "0"))} className="text-white/35 active:scale-90" aria-label={T("Copy", "কপি")}><Copy size={10} /></button>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] text-white/45">{T("Wallet number", "ওয়ালেট নম্বর")}</span>
                <span className="text-[10px] font-bold tabular-nums text-white/80">{r.account_ref}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] text-white/45">{T("Handling fee", "হ্যান্ডলিং ফি")}</span>
                <span className="text-[10px] font-bold tabular-nums text-white/50">{formatTaka(0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] text-white/45">{T("Received", "প্রাপ্ত সময়")}</span>
                <span className="text-[10px] font-bold tabular-nums text-white/50">
                  {r.status === "APPROVED"
                    ? new Date(r.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-[8px] text-white/35">{T("Requested", "অনুরোধ")}</p>
                <p className="text-[11px] font-black tabular-nums text-[#F5B800]">{formatTaka(r.amount_cents, false)}</p>
              </div>
              <div className="border-x border-white/8">
                <p className="text-[8px] text-white/35">{T("Received", "প্রাপ্ত পরিমাণ")}</p>
                <p className="text-[11px] font-black tabular-nums text-white/85">{r.status === "APPROVED" ? formatTaka(r.amount_cents, false) : "—"}</p>
              </div>
              <div>
                <p className="text-[8px] text-white/35">{T("Status", "স্থিতি")}</p>
                <p className="text-[10px] font-black text-white/70">
                  {r.status === "APPROVED" ? T("Paid", "পরিশোধিত") : r.status === "REJECTED" ? T("Rejected", "বাতিল") : T("New", "নতুন")}
                </p>
              </div>
            </div>

            {r.status === "PENDING" && (
              <p className="mt-1.5 flex items-center gap-1 text-[8.5px] text-[#F5B800]/70">
                <ChevronRight size={9} /> {T("Waiting for admin approval — balance already held", "অ্যাডমিন অনুমোদনের অপেক্ষায় — ব্যালেন্স হোল্ড করা আছে")}
              </p>
            )}
            {r.status === "REJECTED" && (
              <p className="mt-1.5 flex items-center gap-1 text-[8.5px] text-red-400/70">
                <ChevronRight size={9} /> {T("Rejected — the held amount was refunded to your balance", "বাতিল — হোল্ড করা টাকা ব্যালেন্সে ফেরত দেওয়া হয়েছে")}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
