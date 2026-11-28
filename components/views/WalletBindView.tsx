"use client";
/**
 * ই-ওয়ালেট বাঁধুন — bind payout wallets.
 *
 * One payout number per gateway — bKash, Nagad, Upay, and nothing else (PayWise is a
 * collection gateway and can never receive a payout, so it is not offered here).
 *
 * A bound number is FINAL: it cannot be removed, replaced or re-bound, and no other
 * account can claim it on the same gateway. Once a gateway is bound this screen shows
 * the locked wallet instead of the input. That is what makes a payout trail traceable.
 *
 * The 499bet reference screen also has a "লেনদেন পাসওয়ার্ড" field — this screen now has
 * a real one: a 4–6 digit withdrawal PIN. The first bind sets it; every later bind asks
 * for it, and /api/cashier/accounts refuses to store a number without it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Lock, Plus, ShieldCheck, Star, Trash2, Wallet } from "lucide-react";
import { useLang } from "../lang";

type Account = { id: number; channel: string; masked: string; last4: string; is_primary: boolean; created_at: string };
type Channel = { id: string; logo: string; color: string; label: string; min_amount_cents: number; max_amount_cents: number };

const FALLBACK: Channel[] = [
  { id: "bKash", logo: "/providers/bkash.png", color: "#e2136e", label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
  { id: "Nagad", logo: "/providers/nagad.png", color: "#f6921e", label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
  { id: "Upay", logo: "/providers/upay.png", color: "#e63b2e", label: "Personal", min_amount_cents: 20000, max_amount_cents: 2500000 },
];
const BRAND: Record<string, { logo: string; color: string }> = {
  bKash: { logo: "/providers/bkash.png", color: "#e2136e" },
  Nagad: { logo: "/providers/nagad.png", color: "#f6921e" },
  Upay: { logo: "/providers/upay.png", color: "#e63b2e" },
};

export default function WalletBindView({ showToast, onBack }: {
  showToast: (m: string) => void;
  onBack: () => void;
}) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const [channels, setChannels] = useState<Channel[]>(FALLBACK);
  const [group, setGroup] = useState<string>("bKash");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [maxPer, setMaxPer] = useState(4);
  const [number, setNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Withdrawal PIN: created on the first bind, required on every later one. */
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/cashier/accounts", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) {
      setAccounts(r.accounts || []);
      if (r.max_per_channel) setMaxPer(Number(r.max_per_channel));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/cashier/pin", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (d?.ok) setPinSet(Boolean(d.set)); })
      .catch(() => setPinSet(null));
  }, []);

  useEffect(() => {
    // Payout rails only: this screen binds numbers that money is PAID OUT to, so a
    // collection gateway (PayWise) must never appear here — you cannot withdraw to it.
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
            min_amount_cents: Number(c.min_amount_cents) || 10000,
            max_amount_cents: Number(c.max_amount_cents) || 25000000,
          })));
          setGroup((prev) => (list.some((c: any) => String(c.channel) === prev) ? prev : String(list[0].channel)));
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const mine = useMemo(() => accounts.filter(a => a.channel === group), [accounts, group]);
  /** This gateway is already bound → the number is locked for good, no input shown. */
  const locked = mine.length >= maxPer;
  const atLimit = locked;
  const valid = /^01[3-9]\d{8}$/.test(number);

  async function add() {
    if (!valid) return showToast(T("Enter a valid 11-digit wallet number", "সঠিক ১১ ডিজিটের ওয়ালেট নম্বর দিন"));
    if (["bKash", "Nagad"].includes(group) && accountHolder.trim().length < 2) return showToast(T("Enter the wallet account holder name", "ওয়ালেট অ্যাকাউন্টধারীর নাম লিখুন"));
    if (!/^\d{4,6}$/.test(pin)) return showToast(T("Set a 4–6 digit withdrawal PIN", "৪–৬ ডিজিটের উত্তোলন পিন দিন"));
    // First time: the PIN is created here (and confirmed twice so it cannot be a typo).
    if (pinSet === false && pin !== pin2) return showToast(T("The two PINs do not match", "দুটি পিন মিলছে না"));
    setBusy(true);
    try {
      if (pinSet === false) {
        const sp = await fetch("/api/cashier/pin", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }),
        }).then(r => r.json()).catch(() => null);
        if (!sp?.ok) return showToast(sp?.error || T("Could not save the PIN", "পিন সংরক্ষণ হয়নি"));
        setPinSet(true);
      }
      const r = await fetch("/api/cashier/accounts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: group, account_number: number, account_holder: accountHolder, pin }),
      }).then(r => r.json()).catch(() => null);
      if (!r?.ok) {
        if (r?.code === "pin_wrong" || r?.code === "pin_locked") return showToast(r.error);
        if (r?.code === "already_bound") return showToast(T("This number is already bound to your account", "এই নম্বরটি আপনার অ্যাকাউন্টে আগেই বাঁধা আছে"));
        if (r?.code === "number_in_use") return showToast(T("This number is already linked to another account", "এই নম্বরটি অন্য একটি অ্যাকাউন্টে বাঁধা আছে"));
        if (r?.code === "channel_locked") return showToast(r.error);
        return showToast(r?.error || T("Could not bind the number", "নম্বর বাঁধা যায়নি"));
      }
      setJustAdded(String(number));
      setNumber(""); setPin(""); setPin2("");
      await load();
      showToast(T("✅ Wallet bound", "✅ ওয়ালেট বাঁধা হয়েছে"));
    } finally { setBusy(false); }
  }

  async function makePrimary(id: number) {
    const r = await fetch("/api/cashier/accounts", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    }).then(r => r.json()).catch(() => null);
    if (!r?.ok) return showToast(r?.error || T("Could not update", "আপডেট হয়নি"));
    await load();
    showToast(T("Primary wallet updated", "প্রধান ওয়ালেট আপডেট হয়েছে"));
  }

  return (
    <div className="pb-[92px]">
      {/* title row */}
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Back", "ফিরে যান")}>
          <ChevronLeft size={19} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-black tracking-wide text-white">{T("Bind e-wallet", "ই-ওয়ালেট বাঁধুন")}</h1>
        <span className="w-9" />
      </div>

      <div className="space-y-2.5 px-3">
        {/* 1. group */}
        <section className="card-metal rounded-2xl p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5B800]" />
            {T("Choose an e-wallet group", "ই-ওয়ালেট গ্রুপ নির্বাচন করুন")}
          </h2>
          <div className="grid grid-cols-3 gap-1.5">
            {channels.map(c => {
              const active = group === c.id;
              return (
                <button key={c.id} onClick={() => { setGroup(c.id); setNumber(""); }}
                  className={`flex items-center gap-1.5 rounded-xl border p-1.5 transition-all ${active ? "border-[#F5B800] bg-[#F5B800]/10 ring-1 ring-[#F5B800]/50" : "border-white/10 bg-white/[.03]"}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
                    {c.logo
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={c.logo} alt={c.id} className="h-full w-full object-contain" />
                      : <span className="text-[11px] font-black" style={{ color: c.color }}>{c.id.slice(0, 1)}</span>}
                  </span>
                  <span className="truncate text-[11px] font-black text-white">{c.id}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. wallet type + number */}
        <section className="card-metal rounded-2xl p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5B800]" />
            {T("Wallet type", "ই-ওয়ালেট প্রকার")}
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#F5B800]/60 bg-[#F5B800]/10 px-3 py-2 text-[12px] font-black text-[#F5B800]">
            <Wallet size={13} /> {group}
          </span>

          {locked ? (
            // Bound already: nothing to type, nothing to change.
            <div className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[.07] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                <ShieldCheck size={12} /> {T("Wallet locked", "ওয়ালেট লক করা আছে")}
              </p>
              <p className="mt-1 text-[17px] font-black tabular-nums tracking-[.14em] text-white">{mine[0]?.masked}</p>
              <p className="mt-0.5 text-[8.5px] leading-snug text-white/45">
                {T("Your one " + group + " number is permanently bound to this account. It can't be removed, replaced or used by another account.",
                   "আপনার একটি " + group + " নম্বর স্থায়ীভাবে এই অ্যাকাউন্টে বাঁধা। এটি সরানো, বদলানো বা অন্য অ্যাকাউন্টে ব্যবহার করা যাবে না।")}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-2 flex h-12 items-center rounded-xl border border-white/12 bg-black/45 px-3">
                <input value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  inputMode="numeric" placeholder={`* ${T(`Enter your ${group} account number`, `অনুগ্রহ করে ${group} অ্যাকাউন্ট নম্বর পূরণ করুন`)}`}
                  className="w-full border-0 bg-transparent text-[14px] font-bold tabular-nums tracking-wider text-white !shadow-none placeholder:text-[11px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/25" />
                {number && <span className={`ml-1 text-[9px] font-black ${valid ? "text-emerald-400" : "text-red-400"}`}>{number.length}/11</span>}
              </div>

              {(["bKash", "Nagad"].includes(group)) && <>
                <label className="mt-2 block text-[9px] font-bold uppercase tracking-widest text-white/45">{T("Wallet account holder name", "ওয়ালেট অ্যাকাউন্টধারীর নাম")}</label>
                <input value={accountHolder} onChange={e => setAccountHolder(e.target.value.slice(0, 100))}
                  autoComplete="name" placeholder={T("Enter the name registered to this wallet", "ওয়ালেটে নিবন্ধিত নাম লিখুন")}
                  className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/45 px-3 text-[13px] font-semibold text-white placeholder:text-[10px] placeholder:text-white/25" />
              </>}

              {/* withdrawal PIN — created on the first bind, required on every later one */}
              <label className="mt-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/45">
                <Lock size={10} className="text-[#F5B800]" />
                {pinSet === false ? T("Set withdrawal PIN (4–6 digits)", "উত্তোলন পিন সেট করুন (৪–৬ ডিজিট)") : T("Withdrawal PIN", "উত্তোলন পিন")}
              </label>
              <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" type="password" autoComplete="new-password" maxLength={6}
                placeholder="••••"
                className="mt-1 h-11 w-full rounded-xl border border-[#F5B800]/40 bg-black/45 px-3 text-center text-[16px] font-black tracking-[.4em] text-white placeholder:tracking-widest placeholder:text-white/25" />
              {pinSet === false && (
                <input value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric" type="password" autoComplete="new-password" maxLength={6}
                  placeholder={T("Repeat PIN", "পিন আবার দিন")}
                  className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/45 px-3 text-center text-[16px] font-black tracking-[.4em] text-white placeholder:text-[11px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/25" />
              )}
              <p className="mt-1 text-[8.5px] leading-snug text-white/35">
                {pinSet === false
                  ? T("Remember this PIN — you need it for every withdrawal and for binding another wallet.",
                      "এই পিনটি মনে রাখুন — প্রতিবার উত্তোলন এবং নতুন ওয়ালেট বাঁধার সময় লাগবে।")
                  : T("The same PIN protects every withdrawal.", "একই পিন প্রতিটি উত্তোলনে প্রযোজ্য।")}
              </p>

              <button onClick={add} disabled={busy || !valid || !/^\d{4,6}$/.test(pin)}
                className="gold-btn mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px]">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {T(`Bind ${group} wallet`, `${group} ওয়ালেট বাঁধুন`)}
              </button>
              <p className="mt-1.5 flex items-start gap-1 text-[8.5px] leading-snug text-white/35">
                <Lock size={10} className="mt-0.5 shrink-0" />
                {T("The number must be in your own name, and it is bound permanently. Withdrawals can only go to this number.",
                  "নম্বরটি অবশ্যই আপনার নিজের নামে হতে হবে এবং এটি স্থায়ীভাবে বাঁধা হবে। উত্তোলন শুধু এই নম্বরেই যাবে।")}
              </p>
            </>
          )}
        </section>

        {/* 3. bound list — "আবদ্ধ BKASH (1/4)" */}
        <section className="card-metal rounded-2xl p-3">
          <h2 className="mb-2 flex items-center justify-between text-[11px] font-bold text-white/70">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#F5B800]" />
              {T(`Bound ${group.toUpperCase()}`, `আবদ্ধ ${group.toUpperCase()}`)}
            </span>
            {mine.length > 0 && <span className="flex items-center gap-0.5 text-[8.5px] font-black text-emerald-400"><Lock size={9} />{T("locked", "লক")}</span>}
          </h2>

          {loading && <p className="py-4 text-center text-[10px] text-white/30">{T("Loading…", "লোড হচ্ছে…")}</p>}

          {!loading && mine.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 py-5 text-center text-[10px] text-white/30">
              {T("No wallet bound yet", "এখনো কোনো ওয়ালেট বাঁধা নেই")}
            </p>
          )}

          <div className="space-y-1.5">
            {mine.map(a => {
              const fresh = justAdded && a.masked.endsWith(String(justAdded).slice(-3));
              return (
                <div key={a.id} className="relative overflow-hidden rounded-xl border border-[#F5B800]/25 bg-gradient-to-br from-[#1f3a2e] via-[#16262f] to-[#1b1b3a] px-3 py-2.5">
                  <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#F5B800]/10 blur-xl" />
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-black text-white">
                      <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-white p-0.5">
                        {BRAND[a.channel]?.logo
                          /* eslint-disable-next-line @next/next/no-img-element */
                          ? <img src={BRAND[a.channel].logo} alt={a.channel} className="h-full w-full object-contain" />
                          : null}
                      </span>
                      {a.channel}
                      {a.is_primary && <span className="rounded bg-[#F5B800]/20 px-1 text-[7px] font-black tracking-wider text-[#F5B800]">{T("PRIMARY", "প্রধান")}</span>}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300">
                      <Lock size={9} /> {T("permanent", "স্থায়ী")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[17px] font-black tabular-nums tracking-[.14em] text-white">{a.masked}</p>
                  <p className="text-[8.5px] tabular-nums text-white/40">{new Date(a.created_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  {fresh && <p className="mt-0.5 text-[8px] font-black text-emerald-400">{T("just bound", "এইমাত্র বাঁধা হয়েছে")}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <p className="flex items-start gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[.06] px-2.5 py-2 text-[9px] leading-snug text-emerald-300/80">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          {T("One number per wallet (bKash · Nagad · Upay). A bound number is permanent and can never be used by another account — that is what keeps payouts traceable.",
            "প্রতিটি ওয়ালেটে (বিকাশ · নগদ · উপায়) একটি নম্বর। বাঁধা নম্বর স্থায়ী এবং অন্য অ্যাকাউন্টে ব্যবহার করা যায় না — এতেই উত্তোলন নিরাপদ থাকে।")}
        </p>
      </div>
    </div>
  );
}
