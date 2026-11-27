"use client";
/**
 * মিশন — turnover missions, rebuilt from the 499bet /m/lead reference.
 *
 * A blue hero card carries the player id, balance and the three tabs
 * (চলমান / শীঘ্রই আসছে / শেষ). Under it sits today's headline mission with the
 * countdown and a 0%–100% bar, then অসম্পূর্ণ লক্ষ্য — every unfinished target
 * with its real progress against that target and the bonus it pays.
 *
 * Progress is the player's actual turnover since the last Asia/Dhaka midnight,
 * recomputed server-side on every read, so the numbers can never drift from
 * the ledger. Unreached missions are shown greyed exactly like the reference.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "@/components/lang";
import { formatTaka } from "@/lib/format";
import { ChevronLeft, Rocket, Clock, Ban, Flag, Flame, Medal } from "lucide-react";

type Mission = {
  id: string; title_bn: string; title_en: string;
  target_cents: number; bonus_cents: number;
  progress_cents: number; pct: number;
  reached: boolean; claimed: boolean; claimable: boolean; claimed_at: string | null;
};
type Data = {
  ok: boolean; turnover_cents: number; ends_at: string | null;
  totals: { all: number; reached: number; claimed: number; claimable: number; bonus_on_table_cents: number };
  missions: Mission[];
};

function countdown(endsAt: string | null): string {
  if (!endsAt) return "--:--:--";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function MissionView({ showToast, onBack, user }: {
  showToast: (m: string) => void; onBack: () => void;
  user?: { id: number; balance_cents: number } | null;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [tab, setTab] = useState<"running" | "soon" | "done">("running");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/missions", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setData(r);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);

  async function claim(m: Mission) {
    if (busyId) return;
    setBusyId(m.id);
    try {
      const r = await fetch("/api/missions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }) }).then(r => r.json());
      if (!r.ok) { showToast(r.error === "target_not_reached" ? T("Target not reached yet", "লক্ষ্য এখনো পূরণ হয়নি") : (r.error || T("Could not claim", "দাবি করা যায়নি"))); return; }
      if (r.claimed) showToast(T(`✅ ${formatTaka(r.paid_cents)} mission bonus credited`, `✅ ${formatTaka(r.paid_cents)} মিশন বোনাস যোগ হয়েছে`));
      else showToast(T("Already claimed", "ইতিমধ্যে দাবি করা হয়েছে"));
      await load();
    } catch { showToast(T("Network error — try again", "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন")); }
    finally { setBusyId(null); }
  }

  const missions = data?.missions ?? [];
  const headline = missions[0] ?? null;                       // today's daily mission
  const open = useMemo(() => missions.filter(m => !m.claimed), [missions]);
  const finished = useMemo(() => missions.filter(m => m.claimed), [missions]);
  const shown = tab === "running" ? open : tab === "done" ? finished : [];

  // Reference shows "লক্ষ্য 0/26" with one overall bar — that is missions reached
  // out of the whole catalogue, not the turnover of a single mission.
  const pct = data && data.totals.all > 0 ? Math.round((data.totals.reached / data.totals.all) * 100) : 0;
  const clock = countdown(data?.ends_at ?? null);
  void tick; // keep the countdown re-rendering every second

  return (
    <div className="pb-6">
      {/* ── hero ─────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-[linear-gradient(115deg,#00d4ff_0%,#3b3ed6_38%,#8b2fd0_62%,#ff4fa3_100%)] px-3 pb-4 pt-3">
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute right-4 top-2 h-24 w-24 rounded-full border-[10px] border-white/15" />
        <div className="relative mb-2 flex items-center gap-2">
          <button onClick={onBack} aria-label={T("Back", "ফিরে যান")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white active:scale-90">
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-[15px] font-black text-white">{T("Mission", "মিশন")}</h1>
        </div>
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-gradient-to-br from-[#4a4a4a] to-[#151515] text-white/80">
            <Medal size={26} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-black tabular-nums text-white/95">
              {user ? String(1000000000 + user.id) : "—"}
            </p>
            <p className="text-[26px] font-black leading-none text-white">
              ৳ {formatTaka(user?.balance_cents ?? 0, false).split(".")[0]}
            </p>
          </div>
        </div>
      </div>

      {/* ── tabs, sitting on the seam like the reference ── */}
      <div className="relative -mt-3 px-3">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/15 bg-white/95 shadow-lg">
          {([
            ["running", T("Running", "চলমান"), Rocket, "text-[#3b7ddd]"],
            ["soon", T("Coming soon", "শীঘ্রই আসছে"), Clock, "text-white/60"],
            ["done", T("Finished", "শেষ"), Ban, "text-white/60"],
          ] as const).map(([k, label, Icon, colour]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`flex items-center justify-center gap-1 py-2 text-[10.5px] font-black transition-colors ${
                tab === k ? `${colour} bg-white` : "bg-[#1b1b1b] text-white/60"}`}>
              <Icon size={12} strokeWidth={2.6} />{label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-10 text-center text-[10px] text-white/35">{T("Loading…", "লোড হচ্ছে…")}</p>}

      {!loading && (
        <div className="mt-3 space-y-3 px-3">
          {/* ── headline mission card ── */}
          {headline && (
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(160deg,#dbe6f5,#b9cae2)] p-3 text-[#1a2233] shadow-lg">
              <div className="flex items-start gap-2.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f7d97a] to-[#d29a2a] shadow">
                  <Medal size={24} className="text-white" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12.5px] font-black leading-tight">{T(headline.title_en, headline.title_bn)}</p>
                    <span className="shrink-0 rounded-full border border-[#5a6d88]/40 bg-white/40 px-2 py-0.5 text-[9px] font-black text-[#3c4a5e]">
                      {T("Rules", "নিয়ম")}
                    </span>
                  </div>
                  <p className="mt-1 text-[9.5px] font-bold text-[#33405a]">
                    {T("Date", "তারিখ")}: {data?.ends_at ? new Date(new Date(data.ends_at).getTime() - 864e5).toLocaleDateString("sv-SE") : "—"}
                    <span className="text-[#33405a]/60"> ~ {data?.ends_at ? new Date(data.ends_at).toLocaleDateString("sv-SE") : "—"}</span>
                  </p>
                  <p className="text-[9.5px] font-bold text-[#33405a]">
                    {T("Remaining", "অবশিষ্ট")}: <span className="tabular-nums">{clock}</span>
                  </p>
                  <p className="text-[9.5px] font-bold text-[#33405a]">
                    {T("Target", "লক্ষ্য")}: <span className="tabular-nums">{data?.totals.reached ?? 0}</span>
                    <span className="text-[#33405a]/70">/{data?.totals.all ?? 0}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <span className="text-[22px] font-black leading-none">{pct}%</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#f7d97a] to-[#e0a92e]" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* ── অসম্পূর্ণ লক্ষ্য ── */}
          {tab !== "soon" && (
            <>
              <p className="flex items-center gap-1 text-[12px] font-black text-white">
                <Flame size={14} className="text-[#ff7a3d]" />
                {T(`Unfinished targets (${shown.length})`, `অসম্পূর্ণ লক্ষ্য (${shown.length})`)}
              </p>

              {shown.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] px-4 py-10 text-center">
                  <Flag size={22} className="mx-auto text-white/25" />
                  <p className="mt-1.5 text-[11px] font-black text-white/60">
                    {tab === "done" ? T("Nothing finished yet", "এখনো কিছু শেষ হয়নি") : T("No data", "কোনো ডেটা নেই")}
                  </p>
                  <p className="mt-1 text-[9px] text-white/35">
                    {tab === "done"
                      ? T("Complete a target and claim it — it will be listed here.", "লক্ষ্য পূরণ করে দাবি করুন — এখানে দেখা যাবে।")
                      : T("Every target is already claimed. Come back tomorrow.", "সব লক্ষ্য ইতিমধ্যে দাবি করা হয়েছে। আগামীকাল আবার আসুন।")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {shown.map((m, i) => (
                  <div key={m.id} className="relative pl-8">
                    {/* the dashed rail + runner dot */}
                    {i < shown.length - 1 && (
                      <span aria-hidden className="absolute left-[13px] top-8 h-[calc(100%-8px)] border-l-2 border-dashed border-white/15" />
                    )}
                    <span className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full ${
                      m.reached ? "bg-gradient-to-b from-[#ffc84a] to-[#f09a1e] text-white" : "bg-white/12 text-white/40"}`}>
                      <Flag size={13} strokeWidth={2.6} />
                    </span>

                    <div className={`rounded-xl border p-2.5 ${m.reached ? "border-[#F5B800]/50 bg-[#F5B800]/[.07]" : "border-white/10 bg-[#1c1c1c]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11.5px] font-black text-white">{T("Valid bet", "বৈধ বেট")}:</p>
                        <p className="shrink-0 text-[11px] font-black tabular-nums text-white/85">
                          ৳ {formatTaka(m.progress_cents, false).split(".")[0]} / {formatTaka(m.target_cents, false)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/50">
                        <div className={`h-full rounded-full ${m.reached ? "bg-[#F5B800]" : "bg-white/25"}`} style={{ width: `${m.pct}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#4ea8f5]/15 px-2 py-0.5 text-[9.5px] font-black text-[#5cb0f7]">
                          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#4ea8f5] text-[6px] text-white">৳</span>
                          {T("Bonus", "বোনাস")}: ৳ {formatTaka(m.bonus_cents, false)}
                        </span>
                        {m.claimed ? (
                          <span className="text-[9px] font-black text-emerald-400">{T("Claimed", "দাবিকৃত")}</span>
                        ) : m.claimable ? (
                          <button onClick={() => claim(m)} disabled={busyId === m.id}
                            className="rounded-full bg-gradient-to-b from-[#3fd07a] to-[#22b463] px-3 py-1 text-[9.5px] font-black text-white active:scale-95 disabled:opacity-60">
                            {busyId === m.id ? "…" : T("Claim", "দাবি")}
                          </button>
                        ) : (
                          <span className="text-[9px] font-bold text-white/35">{T("In progress", "চলমান")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "soon" && (
            <div className="rounded-2xl border border-white/10 bg-[#1c1c1c] px-4 py-12 text-center">
              <Clock size={22} className="mx-auto text-white/25" />
              <p className="mt-1.5 text-[11px] font-black text-white/60">{T("No data", "কোনো ডেটা নেই")}</p>
              <p className="mt-1 text-[9px] text-white/35">{T("New missions are on the way.", "নতুন মিশন আসছে।")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
