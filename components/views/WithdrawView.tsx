"use client";
/**
 * Uttolon (withdrawal) — rebuilt to the 499bet cashier layout:
 *
 *   1. title row: back · উত্তোলন · records icon → WithdrawRecordsView
 *   2. gateway tabs (bKash / Nagad / Upay) with the brand logos
 *   3. "আবদ্ধ BKASH (1/2)" — the bound wallets, as selectable gradient cards,
 *      plus the red + button that opens ই-ওয়ালেট বাঁধুন
 *   4. payout time, the wallet-verification notice, daily-cap counters
 *   5. amount + confirm, and a short "recent" list
 *
 * Everything money-related is unchanged on the server: the turnover rule, the
 * immediate balance hold, and admin approval. The only new hard rule is that a
 * payout may only go to a number bound under ই-ওয়ালেট বাঁধুন — enforced in
 * /api/cashier/request, not merely in this UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpFromLine, CheckCircle2, ChevronLeft, ClipboardList, Loader2, LockKeyhole,
  Plus, RefreshCw, ShieldCheck, TrendingUp, Wallet,
} from "lucide-react";
import { useLang } from "../lang";
import { formatTaka, parseTakaToCents } from "@/lib/format";
import { useRules } from "@/lib/useRules";
import { taka } from "@/lib/rules";
import type { CashierRequestRow, SessionUser } from "@/lib/types";

type Channel = { id: string; logo: string; color: string; label: string; min_amount_cents: number; max_amount_cents: number };
type Account = { id: number; channel: string; masked: string; last4: string; is_primary: boolean; created_at: string };
type Turnover = { requiredCents: number; wageredCents: number; remainingCents: number; ok: boolean; notice?: string };

const BRAND: Record<string, { logo: string; color: string }> = {
  bKash: { logo: "/providers/bkash.png", color: "#e2136e" },
  Nagad: { logo: "/providers/nagad.png", color: "#f6921e" },
  Upay: { logo: "/providers/upay.png", color: "#e63b2e" },
  Rocket: { logo: "/providers/rocket.png", color: "#8c3494" },
};
// Payout rails the operator pays by hand. bKash / Nagad / Upay only — Rocket is not used.
const FALLBACK: Channel[] = [
  { id: "bKash", logo: BRAND.bKash.logo, color: BRAND.bKash.color, label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
  { id: "Nagad", logo: BRAND.Nagad.logo, color: BRAND.Nagad.color, label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
  { id: "Upay", logo: BRAND.Upay.logo, color: BRAND.Upay.color, label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
];
/* must all be >= withdraw_min_amount_cents, otherwise a chip would be rejected on tap */
const QUICK = [500, 1000, 2000, 5000];
const CARD_BG = [
  "linear-gradient(120deg,#6d5bd0 0%,#4a7ec9 45%,#39c6b5 100%)",
  "linear-gradient(120deg,#1f7a4d 0%,#2e9c63 55%,#7fd6a1 100%)",
  "linear-gradient(120deg,#8c3494 0%,#a8507f 55%,#c96f9b 100%)",
  "linear-gradient(120deg,#8a5a00 0%,#c58f12 55%,#f0c65a 100%)",
];

function StatusChip({ s }: { s: string }) {
  // PAID = PayWise accepted the payout automatically; APPROVED = an admin cleared it.
  // Both mean the player's money is on its way, so both read as success.
  const ok = s === "APPROVED" || s === "PAID";
  const cls = ok ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
    : s === "REJECTED" ? "text-red-400 border-red-400/40 bg-red-400/10"
    : "text-amber-300 border-amber-300/40 bg-amber-300/10";
  const label = s === "PAID" ? "PAID OUT" : s === "APPROVED" ? "APPROVED" : s;
  return <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wide ${cls}`}>{label}</span>;
}

export default function WithdrawView({ user, onAuthClick, showToast, refreshUser, goBind, goRecords, onBack }: {
  user: SessionUser | null; onAuthClick: () => void; showToast: (m: string) => void; refreshUser: () => Promise<any>;
  goBind: () => void; goRecords: () => void; onBack: () => void;
}) {
  const { lang } = useLang();
  const rules = useRules();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [channels, setChannels] = useState<Channel[]>(FALLBACK);
  const [channel, setChannel] = useState<string>("bKash");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [maxPer, setMaxPer] = useState(1); // one payout number per gateway
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CashierRequestRow[]>([]);
  const [turnover, setTurnover] = useState<Turnover | null>(null);
  const [counters, setCounters] = useState<{ today: number; limit: number; pending: number } | null>(null);
  /** Withdrawal PIN — required for every payout request (server-checked). */
  const [pin, setPin] = useState("");
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  /** Repeat field, only shown when creating a PIN (players who bound before v49). */
  const [pin2, setPin2] = useState("");

  /** Reload everything the screen shows; also used by the "রিফ্রেশ" button. */
  const load = useCallback(async () => {
    if (!user) return;
    const [h, t, a, c] = await Promise.all([
      fetch("/api/cashier/history?type=WITHDRAW&range=today", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/cashier/status", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/cashier/accounts", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/cashier/counters", { cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]);
    if (h?.ok) setHistory(h.requests);
    const req = t?.requirement;
    if (t?.ok && req) setTurnover({ requiredCents: req.requiredCents, wageredCents: req.wageredCents, remainingCents: req.remainingCents, ok: req.ok, notice: req.notice || "" });
    if (a?.ok) { setAccounts(a.accounts || []); if (a.max_per_channel) setMaxPer(Number(a.max_per_channel)); }
    if (c?.ok) setCounters({ today: c.today_withdrawals, limit: c.daily_limit, pending: c.pending_withdrawals });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/cashier/pin", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (d?.ok) setPinSet(Boolean(d.set)); })
      .catch(() => setPinSet(null));
  }, [user]);

  useEffect(() => {
    // Payout rails only (bKash / Nagad / Upay). Deposit gateways such as PayWise are a
    // different list — a player cannot be paid out through a collection gateway.
    fetch("/api/cashier/channels?for=withdraw", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const list = (d?.channels ?? []).filter((c: any) => c.for_payout !== false);
        if (d?.ok && list.length) {
          setChannels(list.map((c: any) => ({
            id: String(c.channel),
            logo: String(c.logo_url || BRAND[String(c.channel)]?.logo || ""),
            color: BRAND[String(c.channel)]?.color || "#8a6b1f",
            label: String(c.account_label || "Personal"),
            min_amount_cents: Number(c.min_amount_cents) || 20000,
            max_amount_cents: Number(c.max_amount_cents) || 2500000,
          })));
          setChannel(prev => (list.some((c: any) => String(c.channel) === prev) ? prev : String(list[0].channel)));
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const mine = useMemo(() => accounts.filter(a => a.channel === channel), [accounts, channel]);
  const selectedAccount = useMemo(() => mine.find(a => a.id === picked) ?? mine.find(a => a.is_primary) ?? mine[0] ?? null, [mine, picked]);
  useEffect(() => { setPicked(null); }, [channel]);

  const required = turnover?.requiredCents ?? 0;
  const wagered = turnover?.wageredCents ?? 0;
  const remaining = turnover?.remainingCents ?? 0;
  const eligible = turnover ? turnover.ok : false;
  const progress = required > 0 ? Math.min(1, wagered / required) : 1;
  const sel = channels.find(c => c.id === channel) ?? channels[0];
  const cents = useMemo(() => parseTakaToCents(amount), [amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAccount) return showToast(T("Bind a wallet first", "আগে একটি ওয়ালেট বাঁধুন"));
    if (!/^\d{4,6}$/.test(pin)) return showToast(T("Enter your 4–6 digit withdrawal PIN", "৪–৬ ডিজিটের উত্তোলন পিন দিন"));
    // First-time setup straight from this screen: the PIN is created, then used.
    if (pinSet === false && pin !== pin2) return showToast(T("The two PINs do not match", "দুটি পিন মিলছে না"));
    if (!Number.isFinite(cents) || cents < rules.withdraw_min_amount_cents) return showToast(T(`Minimum withdrawal ${taka(rules.withdraw_min_amount_cents)}`, `সর্বনিম্ন উত্তোলন ${taka(rules.withdraw_min_amount_cents)}`));
    if (turnover && !turnover.ok) {
      return showToast(T(`Complete ৳${(remaining / 100).toLocaleString("en-IN")} more wagering first`,
        `আরও ৳${(remaining / 100).toLocaleString("en-IN")} টার্নওভার বাকি — আরও বাজি ধরুন`));
    }
    setBusy(true);
    try {
      if (pinSet === false) {
        const sp = await fetch("/api/cashier/pin", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }),
        }).then(r => r.json()).catch(() => null);
        if (!sp?.ok) return showToast(sp?.error || T("Could not save the PIN", "পিন সংরক্ষণ হয়নি"));
        setPinSet(true);
      }
      const r = await fetch("/api/cashier/request", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_type: "WITHDRAW", channel,
          // The payout number is resolved from the bound wallet server-side; the
          // client only ever holds the mask, so the full number never travels.
          account_id: selectedAccount.id,
          amount_cents: cents,
          pin,
        }),
      }).then(r => r.json());
      if (!r.ok) {
        if (r.turnover) setTurnover(r.turnover);
        // A wrong PIN must not look like a network problem — say exactly what happened.
        if (r.code === "pin_wrong" || r.code === "pin_locked" || r.code === "pin_not_set") {
          setPin("");
          return showToast(r.error || T("Withdrawal PIN is incorrect", "উত্তোলন পিন সঠিক নয়"));
        }
        return showToast(r.error || T("Request failed", "অনুরোধ ব্যর্থ হয়েছে"));
      }
      setPin(""); setPin2("");
      showToast(T("✅ Withdrawal requested — funds held", "✅ উত্তোলন অনুরোধ জমা হয়েছে — ফান্ড হোল্ড করা হয়েছে"));
      await refreshUser(); await load();
    } finally { setBusy(false); }
  }

  if (!user) return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 pt-20 text-center">
      <LockKeyhole size={44} className="text-[#F5B800]/70" strokeWidth={1.5} />
      <p className="text-sm font-bold text-white/80">{T("Login to withdraw", "উত্তোলন করতে লগইন করুন")}</p>
      <button onClick={onAuthClick} className="gold-btn h-11 rounded-xl px-6 text-sm">{T("Login / Register", "লগইন / রেজিস্টার")}</button>
    </div>
  );

  return (
    <div className="pb-[96px]">
      {/* 1. title row */}
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Back", "ফিরে যান")}>
          <ChevronLeft size={19} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-black tracking-wide text-white">{T("Withdraw", "উত্তোলন")}</h1>
        <button onClick={goRecords} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-[#F5B800] active:scale-90" aria-label={T("Records", "রেকর্ড")}>
          <ClipboardList size={17} />
        </button>
      </div>

      {/* 2. gateway tabs */}
      <div className="flex items-stretch gap-1 overflow-x-auto border-b border-white/10 px-2">
        {channels.map(c => {
          const on = channel === c.id;
          return (
            <button key={c.id} onClick={() => setChannel(c.id)}
              className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-2 transition-opacity ${on ? "opacity-100" : "opacity-55"}`}>
              <span className="text-[12px] font-black text-white">{c.id}</span>
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-white p-0.5">
                {c.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.logo} alt={c.id} className="h-full w-full object-contain" /> : null}
              </span>
              {on && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t bg-[#e2136e]" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 px-3 pt-2.5">
        {/* 3. bound wallets */}
        <section>
          <h2 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
            {T(`Bound ${channel.toUpperCase()}`, `আবদ্ধ ${channel.toUpperCase()}`)}
            {mine.length > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300">
                <LockKeyhole size={8} /> {T("permanent", "স্থায়ী")}
              </span>
            )}
          </h2>

          <div className="relative">
            <div className="flex snap-x gap-2 overflow-x-auto pb-1">
              {mine.length === 0 && (
                <button onClick={goBind} className="flex h-[104px] w-full snap-start flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#F5B800]/40 bg-[#F5B800]/[.04]">
                  <Plus size={20} className="text-[#F5B800]" />
                  <span className="text-[11px] font-black text-[#F5B800]">{T("Bind an e-wallet", "ই-ওয়ালেট বাঁধুন")}</span>
                  <span className="text-[8.5px] text-white/40">{T("Required before you can withdraw", "উত্তোলনের আগে আবশ্যক")}</span>
                </button>
              )}

              {mine.map((a, i) => {
                const on = selectedAccount?.id === a.id;
                return (
                  <button key={a.id} onClick={() => setPicked(a.id)}
                    style={{ backgroundImage: CARD_BG[i % CARD_BG.length] }}
                    className={`relative h-[104px] w-[240px] shrink-0 snap-start overflow-hidden rounded-xl p-2.5 text-left transition-all ${on ? "ring-2 ring-[#F5B800]" : "ring-1 ring-white/10"}`}>
                    <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl" />
                    <span className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded bg-white/90 p-0.5">
                        {BRAND[a.channel]?.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={BRAND[a.channel].logo} alt={a.channel} className="h-full w-full object-contain" /> : null}
                      </span>
                      <span className="text-[13px] font-black text-white">{a.channel}</span>
                      <span className="flex items-center gap-0.5 rounded bg-black/25 px-1 text-[7px] font-black tracking-wider text-white/90">
                        <LockKeyhole size={7} /> {T("BOUND", "বাঁধা")}
                      </span>
                      {on && <CheckCircle2 size={14} className="ml-auto text-white drop-shadow" />}
                    </span>
                    <p className="mt-2 text-[15px] font-black tabular-nums tracking-[.16em] text-white">********{a.last4}</p>
                    <p className="mt-1 text-[8.5px] tabular-nums text-white/70">
                      {new Date(a.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                );
              })}
            </div>

          </div>
        </section>

        {/* 4. notices + counters */}
        <div className="space-y-1 rounded-xl border border-white/8 bg-[#1B1B1B] px-2.5 py-2 text-[10px] text-white/45">
          <p>{T("Payout time:", "উত্তোলন সময়:")} {T("24 hours", "২৪ ঘন্টা")}</p>
          <p className="flex items-start gap-1 leading-snug">
            <Wallet size={11} className="mt-0.5 shrink-0 text-[#F5B800]/70" />
            {T("Before withdrawing, please check that your wallet (bKash/Nagad/Upay) is linked correctly. A wrong wallet can delay or cancel the transfer.",
              "আপনার ওয়ালেট (বিকাশ/নগদ/রকেট) সঠিকভাবে সংযুক্ত হয়েছে কিনা তা যাচাই করুন। ভুল ওয়ালেটে টাকা পাঠালে স্থানান্তরে বিলম্ব বা ব্যর্থতা ঘটতে পারে।")}
          </p>
          <p className="flex items-start gap-1 leading-snug text-amber-300/70">
            <LockKeyhole size={11} className="mt-0.5 shrink-0" />
            {T("Please double-check again and withdraw safely!", "দয়া করে আবার পরীক্ষা করুন এবং নিরাপদে উত্তোলন সম্পন্ন করুন!")}
          </p>
          <p className="tabular-nums text-white/55">
            {T(
              `Daily withdrawals ${counters ? counters.limit.toLocaleString("en-IN") : "—"} (times), remaining ${counters ? Math.max(0, counters.limit - counters.today).toLocaleString("en-IN") : "—"}`,
              `দৈনিক উত্তোলন ${counters ? counters.limit.toLocaleString("en-IN") : "—"} (বার), অবশিষ্ট উত্তোলন ${counters ? Math.max(0, counters.limit - counters.today).toLocaleString("en-IN") : "—"}`
            )}
          </p>
          <p className="tabular-nums text-white/55">
            {T("Payout wallet:", "পেআউট ওয়ালেট:")}{" "}
            <span className="font-black tabular-nums text-white/80">{selectedAccount ? selectedAccount.masked : T("none bound", "কোনোটি বাঁধা নেই")}</span>
          </p>
          <p className="tabular-nums text-white/55">{T("Available balance:", "উপলব্ধ পরিমাণ:")} <span className="font-black text-[#F5B800]">{formatTaka(user.balance_cents)}</span></p>

          <button onClick={async () => { await refreshUser(); await load(); showToast(T("Balance refreshed", "ব্যালেন্স রিফ্রেশ হয়েছে")); }}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#4a8ff5]/40 bg-[#4a8ff5]/10 py-2 text-[11px] font-black text-[#7db6ff] active:scale-[.99]">
            <RefreshCw size={13} /> {T("Refresh your balance", "আপনার ব্যালেন্স রিফ্রেশ করুন")}
          </button>
        </div>

        {/* turnover */}
        <section className="card-metal rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
              <Wallet size={13} className="text-[#F5B800]" />{T("Available", "উপলব্ধ ব্যালেন্স")}
            </div>
            <ShieldCheck size={13} className="text-emerald-400/70" />
          </div>
          <p className="gold-text mt-1 text-[24px] font-black leading-tight tabular-nums">{formatTaka(user.balance_cents)}</p>
          <div className="mt-1.5">
            <div className="mb-1 flex items-center justify-between text-[8.5px] font-bold text-white/45">
              <span className="flex items-center gap-1"><TrendingUp size={9} />{T("Turnover requirement", "টার্নওভার শর্ত")}</span>
              <span className="tabular-nums">{formatTaka(wagered, false)} / {formatTaka(required, false)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/5 bg-black/50">
              <div className="h-full rounded-full bg-gradient-to-r from-[#c98f00] via-[#F5B800] to-[#ffe066] transition-all duration-700" style={{ width: `${progress * 100}%` }} />
            </div>
            {turnover?.notice ? <p className="mt-0.5 text-[7.5px] text-[#F5B800]/70">{turnover.notice}</p> : null}
            <p className={`mt-1 text-[7.5px] ${eligible ? "text-emerald-400/70" : "text-amber-300/70"}`}>
              {required === 0
                ? T("No turnover requirement — withdraw anytime", "টার্নওভার শর্ত নেই — যখন খুশি উত্তোলন করুন")
                : eligible
                  ? T("✅ Turnover complete — eligible to withdraw", "✅ টার্নওভার সম্পূর্ণ — উত্তোলন যোগ্য")
                  : T(`৳${(remaining / 100).toLocaleString("en-IN")} more wagering needed`, `আরও ৳${(remaining / 100).toLocaleString("en-IN")} বাজি ধরতে হবে`)}
            </p>
          </div>
        </section>

        {/* 5. amount + confirm */}
        <form onSubmit={submit} className="card-metal rounded-2xl p-3 space-y-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-white/50">{T("Amount", "পরিমাণ")}</label>
            <div className="mt-1 flex h-12 items-center rounded-xl border border-white/12 bg-black/45 px-3">
              <span className="mr-2 font-black text-[#F5B800]">৳</span>
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                className="w-full border-0 bg-transparent text-[17px] font-black tabular-nums text-white !shadow-none" placeholder="500" />
              <button type="button" onClick={() => setAmount(String(Math.floor(Number(user.balance_cents) / 100)))}
                className="rounded-md border border-[#F5B800]/40 px-1.5 py-1 text-[8.5px] font-black text-[#F5B800]">{T("MAX", "সর্বোচ্চ")}</button>
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {QUICK.map(q => (
                <button type="button" key={q} onClick={() => setAmount(String(q))}
                  className={`h-9 rounded-lg border text-[11px] font-black tabular-nums transition-all ${amount === String(q) ? "border-[#F5B800] bg-[#F5B800]/15 text-[#F5B800]" : "border-white/10 bg-white/[.04] text-white/70"}`}>
                  ৳{q.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
            <p className="mt-1 flex items-center justify-between text-[8.5px] text-white/35">
              <span>{T(`Minimum withdrawal ${taka(rules.withdraw_min_amount_cents)}`, `সর্বনিম্ন উত্তোলন ${taka(rules.withdraw_min_amount_cents)}`)}</span>
              {Number.isFinite(cents) && cents > Number(user.balance_cents) && (
                <span className="font-black text-red-400">{T("more than your balance", "ব্যালেন্সের চেয়ে বেশি")}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
              {sel?.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={sel.logo} alt={sel.id} className="h-full w-full object-contain" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-black text-white">
                {selectedAccount ? `${channel} · ${T("ending", "শেষ ৪")} ${selectedAccount.last4}` : T("No wallet bound", "কোনো ওয়ালেট বাঁধা নেই")}
              </p>
              <p className="text-[8.5px] text-white/40">{selectedAccount ? selectedAccount.masked : T("Tap + to bind an e-wallet", "ই-ওয়ালেট বাঁধতে + চাপুন")}</p>
            </div>
            <span className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-300">
              <LockKeyhole size={9} /> {T("Locked", "লক")}
            </span>
          </div>

          <div>
            <label className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/50">
              <LockKeyhole size={10} className="text-[#F5B800]" />
              {T("Withdrawal PIN", "উত্তোলন পিন")}
            </label>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" type="password" autoComplete="off" maxLength={6} placeholder="••••"
              className="mt-1 h-12 w-full rounded-xl border border-[#F5B800]/40 bg-black/45 px-3 text-center text-[17px] font-black tracking-[.45em] text-white placeholder:tracking-widest placeholder:text-white/25" />
            {pinSet === false && (
              <input value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" type="password" autoComplete="off" maxLength={6}
                placeholder={T("Repeat PIN", "পিন আবার দিন")}
                className="mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/45 px-3 text-center text-[17px] font-black tracking-[.45em] text-white placeholder:text-[11px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/25" />
            )}
            <p className="mt-1 text-[8.5px] leading-snug text-white/35">
              {pinSet === false
                ? T("First payout — choose a 4–6 digit PIN. You will enter it on every withdrawal and every new wallet.",
                    "প্রথম উত্তোলন — ৪–৬ ডিজিটের একটি পিন ঠিক করুন। প্রতিবার উত্তোলন ও নতুন ওয়ালেটে এটিই লাগবে।")
                : T("The PIN you set when you bound this wallet.", "ওয়ালেট বাঁধার সময় যে পিন দিয়েছিলেন সেটিই।")}
            </p>
          </div>

          <button type="submit" disabled={busy || !eligible || !selectedAccount || !/^\d{4,6}$/.test(pin) || (pinSet === false && pin !== pin2)}
            className="gold-btn flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpFromLine size={16} />}
            {T("Confirm withdrawal", "উত্তোলন নিশ্চিত করুন")}
          </button>
          <p className="text-center text-[8px] text-white/30">
            {T("Balance is held instantly; rejected requests are auto-refunded", "অনুরোধের সাথে সাথে ব্যালেন্স হোল্ড হয়; বাতিল হলে অটো রিফান্ড")}
          </p>
        </form>

        {/* recent */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60"><ClipboardList size={11} />{T("Today's withdrawals", "আজকের উত্তোলন")}</h2>
            <button onClick={goRecords} className="text-[9px] font-black text-[#F5B800]">{T("All records ›", "সব রেকর্ড ›")}</button>
          </div>
          <div className="space-y-1.5">
            {history.length === 0 && <p className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[10px] text-white/30">{T("Nothing today", "আজ কিছু নেই")}</p>}
            {history.slice(0, 4).map(h => (
              <div key={h.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#1E1E1E] px-2.5 py-2">
                <ArrowUpFromLine size={14} className="shrink-0 text-orange-400/70" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-white/85">{h.channel} · <span className="text-[#F5B800]">{formatTaka(h.amount_cents)}</span></p>
                  <p className="truncate text-[8px] tabular-nums text-white/35">{h.account_ref} · {new Date(h.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <StatusChip s={h.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
