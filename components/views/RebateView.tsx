"use client";
/**
 * রিবেট — bet rebate screen, rebuilt from the 499bet /m/rebate reference.
 *
 *   আমার বেট রিবেট   — today's per-category breakdown (তারিখ / স্লট / লাইভ /
 *                      মাছ / পোকার / খেলাধুলা / মোট) with one দাবি button.
 *   রিবেট ইতিহাস     — every past Dhaka day that had turnover, claimed or not.
 *
 * Every figure is real: the API sums the player's wallet_ledger DEBIT rows for
 * the day, joins games_catalog for the category, and multiplies by the
 * rebate_rate_bps platform setting. A category with no bets shows 0.00.
 */
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/lang";
import { formatTaka } from "@/lib/format";
import { ChevronLeft, Info } from "lucide-react";

type Day = {
  day: string;
  slots_cents: number; live_cents: number; table_cents: number;
  crash_cents: number; poker_cents: number; other_cents: number;
  total_cents: number; claimed_at: string | null;
};
type HistRow = { day: string; turnover_cents: number; rebate_cents: number; claimed_at: string | null };
type Data = {
  ok: boolean; rate_bps: number; today: string; day: string;
  latest: Day; can_claim: boolean; history: HistRow[];
};

/** The six coloured rows of the reference screen, in order. */
const ROWS: Array<{ key: keyof Day; bn: string; en: string; bar: string; chip: string }> = [
  { key: "live_cents", bn: "লাইভ", en: "Live", bar: "bg-[#b47cf0]", chip: "from-[#c79bf5] to-[#a86ae8]" },
  { key: "table_cents", bn: "টেবিল", en: "Table", bar: "bg-[#8f7cf0]", chip: "from-[#a996f5] to-[#7f68e8]" },
  { key: "slots_cents", bn: "স্লট", en: "Slots", bar: "bg-[#5b8df0]", chip: "from-[#7ba3f5] to-[#4a7ce8]" },
  { key: "crash_cents", bn: "মাছ", en: "Crash", bar: "bg-[#2ec7a8]", chip: "from-[#4ee0c1] to-[#20b295]" },
  { key: "poker_cents", bn: "পোকার", en: "Poker", bar: "bg-[#f06aa0]", chip: "from-[#f78bb8] to-[#e5558e]" },
  { key: "other_cents", bn: "খেলাধুলা", en: "Sports", bar: "bg-[#f0746a]", chip: "from-[#f78f86] to-[#e05c52]" },
];

export default function RebateView({ showToast, onBack }: { showToast: (m: string) => void; onBack: () => void }) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [tab, setTab] = useState<"mine" | "history">("mine");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/rebate", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setData(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function claim() {
    if (busy || !data?.can_claim) return;
    setBusy(true);
    try {
      const r = await fetch("/api/rebate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(r => r.json());
      if (!r.ok) { showToast(r.error || T("Could not claim", "দাবি করা যায়নি")); return; }
      if (r.claimed) showToast(T(`✅ ${formatTaka(r.paid_cents)} rebate credited`, `✅ ${formatTaka(r.paid_cents)} রিবেট যোগ হয়েছে`));
      else if (r.reason === "nothing_to_claim") showToast(T("No turnover today — nothing to claim yet", "আজ কোনো বাজি নেই — এখনো দাবি করার কিছু নেই"));
      else showToast(T("Already claimed for today", "আজকের রিবেট ইতিমধ্যে নেওয়া হয়েছে"));
      await load();
    } catch { showToast(T("Network error — try again", "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন")); }
    finally { setBusy(false); }
  }

  const total = data?.latest.total_cents ?? 0;
  const dateLabel = data?.latest.day ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-[70vh] px-3 pt-3 pb-6">
      {/* header */}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onBack} aria-label={T("Back", "ফিরে যান")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-[15px] font-black text-white">{T("Rebate", "রিবেট")}</h1>
      </div>

      {/* tabs */}
      <div className="mb-3 grid grid-cols-2 border-b border-white/10">
        {([["mine", T("My bet rebate", "আমার বেট রিবেট")], ["history", T("Rebate history", "রিবেট ইতিহাস")]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`relative pb-2 text-[12px] font-black transition-colors ${tab === k ? "text-[#4ea8f5]" : "text-white/55"}`}>
            {label}
            {tab === k && <span className="absolute -bottom-px left-1/2 h-[2px] w-16 -translate-x-1/2 rounded-full bg-[#4ea8f5]" />}
          </button>
        ))}
      </div>

      {loading && <p className="py-10 text-center text-[10px] text-white/35">{T("Loading…", "লোড হচ্ছে…")}</p>}

      {!loading && tab === "mine" && (
        <div className="space-y-2">
          {/* তারিখ */}
          <div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1c]">
            <span className="w-[74px] shrink-0 bg-gradient-to-b from-[#f77c8a] to-[#f06b7b] px-2 py-2.5 text-center text-[11px] font-black text-white">
              {T("Date", "তারিখ")}
            </span>
            <span className="flex-1 px-3 text-right text-[13px] font-black tabular-nums text-[#f0a05c]">{dateLabel}</span>
            <span className="h-9 w-[3px] shrink-0 bg-[#f0a05c]" />
          </div>

          {ROWS.map(r => (
            <div key={String(r.key)} className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1c]">
              <span className={`w-[74px] shrink-0 bg-gradient-to-b ${r.chip} px-2 py-2.5 text-center text-[11px] font-black text-white`}>
                {T(r.en, r.bn)}
              </span>
              <span className="flex-1 px-3 text-right text-[13px] font-black tabular-nums text-[#f0a05c]">
                {formatTaka(Number(data?.latest[r.key] ?? 0), false)}
              </span>
              <span className={`h-9 w-[3px] shrink-0 ${r.bar}`} />
            </div>
          ))}

          {/* মোট */}
          <div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1c]">
            <span className="w-[74px] shrink-0 bg-gradient-to-b from-[#6b7cf0] to-[#5a6ae0] px-2 py-2.5 text-center text-[11px] font-black text-white">
              {T("Total", "মোট")}
            </span>
            <span className="flex-1 px-3 text-right text-[13px] font-black tabular-nums text-[#f0a05c]">{formatTaka(total, false)}</span>
            <span className="h-9 w-[3px] shrink-0 bg-[#5b8df0]" />
          </div>

          <button onClick={claim} disabled={busy || !data?.can_claim}
            className={`mt-6 h-12 w-full rounded-lg text-[14px] font-black transition-all ${
              data?.can_claim && !busy
                ? "bg-gradient-to-b from-[#3fd07a] to-[#22b463] text-white shadow-[0_6px_20px_rgba(34,180,99,.35)] active:scale-[.99]"
                : "cursor-not-allowed bg-[#3a3a3a] text-white/45"}`}>
            {busy ? "…"
              : data?.latest.claimed_at ? T("Claimed today", "আজ দাবি করা হয়েছে")
              : total > 0 ? T("Claim", "দাবি")
              : T("Claim", "দাবি")}
          </button>

          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-400/40 bg-red-400/[.08] px-2 py-2">
            <Info size={11} className="shrink-0 text-red-400" />
            <p className="text-[9px] font-bold text-red-400">
              {T("Settlement: the totals above are based on GMT + 8 time", "অস্ট্রবর্ণীকরণ: উপরের টোটা GMT + 8 ভিত্তিক")}
            </p>
          </div>

          <p className="pt-1 text-center text-[8px] text-white/30">
            {T(`Rebate rate ${(Number(data?.rate_bps ?? 0) / 100).toFixed(2)}% of turnover · one claim per day`,
              `রিবেট হার টার্নওভারের ${(Number(data?.rate_bps ?? 0) / 100).toFixed(2)}% · দিনে একবার দাবি`)}
          </p>
        </div>
      )}

      {!loading && tab === "history" && (
        <div className="space-y-2">
          {(data?.history ?? []).length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] px-4 py-12 text-center">
              <p className="text-[11px] font-black text-white/60">{T("No data", "কোনো ডেটা নেই")}</p>
              <p className="mt-1 text-[9px] text-white/35">{T("Play a game and your daily rebate will appear here.", "গেম খেলুন — আপনার দৈনিক রিবেট এখানে দেখা যাবে।")}</p>
            </div>
          )}
          {(data?.history ?? []).map(h => (
            <div key={h.day} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1c1c1c] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black tabular-nums text-white/85">{h.day}</p>
                <p className="text-[8.5px] text-white/40">
                  {T("Turnover", "টার্নওভার")} {formatTaka(h.turnover_cents)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-black tabular-nums text-[#F5B800]">{formatTaka(h.rebate_cents, false)}</p>
                <p className={`text-[8px] font-bold ${h.claimed_at ? "text-emerald-400" : "text-white/40"}`}>
                  {h.claimed_at ? T("claimed", "দাবিকৃত") : T("unclaimed", "অদাবিকৃত")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
