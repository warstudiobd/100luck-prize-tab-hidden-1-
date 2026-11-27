"use client";
/**
 * Deposit screen — layout follows the 499bet cashier:
 *
 *   1. title row (back · জমা দিন · bell · support)
 *   2. currency tabs (BDT / Crypto-soon)
 *   3. আমানতের মোড   → wallet tiles (bKash / Nagad / Rocket …)
 *   4. পেমেন্ট চ্যানেল → channel range chips + "More"
 *   5. জমা পরিমাণ     → amount field, limits, quick amounts
 *   6. sticky footer  → জমা / পান / বোনাস totals + confirm button
 *   7. step 2         → wallet number + exact-amount warning + TrxID
 *
 * Money rules are unchanged and server-enforced: a DEPOSIT request lands as
 * PENDING and only credits the wallet after an admin approves it. Every number
 * in the footer comes from /api/wallet/balance (the player's own wallet).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine, BadgeCheck, Bell, CheckCircle2, ChevronLeft, ChevronRight,
  Copy, Headset, History, Info, Loader2, LockKeyhole, Receipt, ShieldCheck, X,
} from "lucide-react";
import { useLang } from "../lang";
import { formatTaka, parseTakaToCents } from "@/lib/format";
import { useRules } from "@/lib/useRules";
import { takaRound } from "@/lib/rules";
import type { CashierRequestRow, SessionUser } from "@/lib/types";
import SupportChat from "../SupportChat";

type ChannelDef = {
  id: string; color: string; logo: string; name: string; hint: string;
  account_label: string; account_number: string; reference: string;
  min_amount_cents: number; max_amount_cents: number; live: boolean; mode: string; api_provider: string;
  /** Hosted gateway: where the player actually pays. Either may be empty. */
  checkout_url?: string; qr_url?: string;
  /** Template like https://gateway/pay?method={method}&amount={amount}&ref={ref} */
  gateway_url?: string;
  /** Per-method overrides, keyed bKash/Nagad/Rocket/Upay. */
  method_urls?: Record<string, string>;
  /** Wallets the server says this gateway can actually take. */
  methods?: string[];
  /** Where that list came from: method_url | template | paywise_api | none. */
  source?: string;
};

const FALLBACK_CHANNELS: ChannelDef[] = [
  // No wallet numbers here on purpose: baked-in placeholders must never be shown as
  // if they were real accounts. Real numbers come from the server (admin Deposit
  // Options); this list only exists so the screen is not empty if the API is down,
  // so it points at the live gateway rather than at anyone's wallet.
  { id: "bKash",  color: "#e2136e", logo: "/providers/bkash.png",  name: "bKash",  hint: "", account_label: "", account_number: "", reference: "", min_amount_cents: 10000, max_amount_cents: 25000000, live: false, mode: "api", api_provider: "PayWise" },
  { id: "Nagad",  color: "#f6921e", logo: "/providers/nagad.png",  name: "Nagad",  hint: "", account_label: "", account_number: "", reference: "", min_amount_cents: 10000, max_amount_cents: 25000000, live: false, mode: "api", api_provider: "PayWise" },
  { id: "Upay",   color: "#e63b2e", logo: "/providers/upay.png",                       name: "Upay",   hint: "", account_label: "", account_number: "", reference: "", min_amount_cents: 10000, max_amount_cents: 25000000, live: false, mode: "api", api_provider: "PayWise" },
];
const CHANNEL_STYLE: Record<string, { color: string; logo: string }> = {
  bKash:  { color: "#e2136e", logo: "/providers/bkash.png" },
  Nagad:  { color: "#f6921e", logo: "/providers/nagad.png" },
  Rocket: { color: "#8c3494", logo: "/providers/rocket.png" },
  Upay:   { color: "#e63b2e", logo: "/providers/upay.png" },
  PayWise: { color: "#F5B800", logo: "" },
};
const QUICK = [100, 200, 300, 500, 1000, 3000, 5000, 10000, 30000];
const taka = (cents: number) => `৳${(cents / 100).toLocaleString("en-IN")}`;

function StatusChip({ s }: { s: string }) {
  const cls = s === "APPROVED" ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
    : s === "REJECTED" ? "text-red-400 border-red-400/40 bg-red-400/10"
    : "text-amber-300 border-amber-300/40 bg-amber-300/10";
  return <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wide ${cls}`}>{s}</span>;
}

/** Section card used throughout the screen (dark metal, gold section titles). */
function Section({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card-metal rounded-2xl p-3">
      <header className="mb-2 flex items-start gap-1.5">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5B800]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[12px] font-black leading-none text-white">{title}</h2>
          {note && <p className="mt-1 text-[9.5px] leading-snug text-[#F5B800]/75">{note}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export default function DepositView({ user, onAuthClick, showToast, onBack, goTab }: {
  user: SessionUser | null; onAuthClick: () => void; showToast: (m: string) => void;
  onBack?: () => void; goTab?: (t: "home" | "deposit" | "promo" | "withdraw" | "member") => void;
}) {
  const { lang } = useLang();
  const bn = lang === "bn";
  const T = (en: string, b: string) => (bn ? b : en);

  const [channel, setChannel] = useState<string>("");
  const [channels, setChannels] = useState<ChannelDef[]>(FALLBACK_CHANNELS);
  const rules = useRules();
  const [amount, setAmount] = useState("500");
  const [step, setStep] = useState<"amount" | "pay">("amount");
  /** BDT wallets vs crypto (USDT/BTC/…): PayWise only switched the crypto rails on. */
  const [asset, setAsset] = useState<"bdt" | "crypto">("bdt");
  const [trx, setTrx] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CashierRequestRow[]>([]);
  /** Live wallet balance (৳ cents) and the change since this screen was opened. */
  const [balance, setBalance] = useState(0);
  const [openBalance, setOpenBalance] = useState<number | null>(null);
  const delta = openBalance === null ? 0 : balance - openBalance;
  const [supportOpen, setSupportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /** PayWise reference shown to the player (created by /api/payments/paywise/intent). */
  const [pwRef, setPwRef] = useState<string>("");
  /** Which wallet the player wants to pay with once inside the gateway. */
  const [payMethod, setPayMethod] = useState("bKash");
  /** Real PayWise checkout page for this request, from /api/payments/paywise/create. */
  const [checkoutUrl, setCheckoutUrl] = useState("");
  /** Why the gateway refused, shown to the player verbatim instead of a dead button. */
  const [gwError, setGwError] = useState<{ code: string; message: string } | null>(null);
  /** True when PayWise has no BDT collection rail for this merchant — show the USDT path. */
  const [noBdtRail, setNoBdtRail] = useState(false);
  /** Direct bank/wallet details the admin pasted into the channel (fallback only). */
  const [guide, setGuide] = useState<{ account_number: string; account_label: string; reference: string } | null>(null);
  /** Crypto (USDT/BTC/…) request created by PayWise: address, exact amount, checkout page. */
  const [crypto, setCrypto] = useState<{
    coin: string; network: string; address: string; payAmount: string;
    amountUsdt: string; checkoutUrl: string; trxRef: string;
  } | null>(null);
  const [coin] = useState<"USDT">("USDT");
  /** "idle" | "pending" | "paid" — polling /api/payments/paywise/status. */
  const [payState, setPayState] = useState<"idle" | "pending" | "paid">("idle");

  /* ── return trips from the payment gateway ─────────────────────────── */
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const d = p.get("deposit");
      if (d === "success") showToast(T("✅ Deposit successful — balance updated", "✅ ডিপোজিট সফল — ব্যালেন্সে যোগ হয়েছে"));
      else if (d === "pending") {
        // Back from the PayWise page: ask the server what PayWise says about our reference.
        const ref = p.get("ref") || "";
        const backAmount = p.get("amount") || "";
        const backChannel = p.get("channel") || "";
        if (backChannel) setChannel(backChannel);
        if (backAmount) setAmount(backAmount);
        if (ref) {
          setPwRef(ref);
          // The player already chose an amount and opened the gateway — put them back
          // on the payment step with their reference visible, not on step 1.
          setStep("pay");
          fetch("/api/payments/paywise/status", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ trx_ref: ref }),
          }).then(r => r.json()).then(r => {
            if (r?.status === "paid" && r?.credited) showToast(T("✅ Deposit successful — balance updated", "✅ ডিপোজিট সফল — ব্যালেন্সে যোগ হয়েছে"));
            else if (r?.status === "pending") showToast(T("⏳ PayWise is still confirming your payment", "⏳ PayWise এখনো আপনার পেমেন্ট নিশ্চিত করছে"));
          }).catch(() => {});
        }
      }
      else if (d === "failed") showToast(T("❌ Payment was not completed", "❌ পেমেন্ট সম্পন্ন হয়নি"));
      if (d) { p.delete("deposit"); p.delete("ref"); p.delete("amount"); p.delete("channel"); const q = p.toString(); window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "")); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const r = await fetch("/api/cashier/history?type=DEPOSIT", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setHistory(r.requests);
  }, [user]);

  /** Wallet balance for the footer's "balance change" line. The first answer is the
   *  baseline, later ones (after a credit) show the difference. */
  const loadBalance = useCallback(async () => {
    if (!user) return;
    const r = await fetch("/api/wallet/balance", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (!r?.ok) return;
    const cents = Number(r.balance_cents) || 0;
    setBalance(cents);
    setOpenBalance(prev => (prev === null ? cents : prev));
  }, [user]);

  useEffect(() => { loadHistory(); loadBalance(); }, [loadHistory, loadBalance]);
  // keep the balance honest while the player is on the page (approval can land any time)
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => { loadBalance(); loadHistory(); }, 30000);
    return () => window.clearInterval(id);
  }, [user, loadBalance, loadHistory]);

  useEffect(() => {
    fetch("/api/cashier/channels", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d?.ok && Array.isArray(d.channels) && d.channels.length) {
          // Follow the server's first active channel (the gateway) instead of a hard-coded
          // wallet name that may not be an active row — that dead-ends on "channel unavailable".
          const firstId = String(d.channels[0]?.channel ?? "");
          setChannel(prev => (prev && d.channels.some((c: any) => String(c.channel) === prev) ? prev : firstId));
          setChannels(d.channels.map((c: any) => {
            const id = String(c.channel);
            return {
              id,
              color: CHANNEL_STYLE[id]?.color ?? "#8a6b1f",
              logo: String(c.logo_url || CHANNEL_STYLE[id]?.logo || ""),
              name: id,
              hint: `${c.account_label || "Personal"}: ${c.account_number || "—"}${c.reference ? ` · Ref: ${c.reference}` : ""}`,
              account_label: String(c.account_label ?? ""),
              account_number: String(c.account_number ?? ""),
              reference: String(c.reference ?? ""),
              min_amount_cents: Number(c.min_amount_cents) || 10000,
              max_amount_cents: Number(c.max_amount_cents) || 25000000,
              live: true,
              mode: String(c.mode ?? "manual"),
              api_provider: String(c.api_provider ?? ""),
              checkout_url: String(c.checkout_url ?? ""),
              qr_url: String(c.qr_url ?? ""),
              gateway_url: String(c.gateway_url ?? ""),
              method_urls: (c.method_urls && typeof c.method_urls === "object") ? c.method_urls : {},
              methods: Array.isArray(c.methods) ? c.methods.map(String) : [],
              source: String(c.source ?? ""),
            };
          }));
        }
      })
      .catch(() => { /* keep built-in fallback */ });
  }, []);

  const selected = channels.find(c => c.id === channel) ?? channels[0];
  /** PayWise is driven entirely by /api/payments/paywise/create, which asks PayWise to
   *  mint a hosted checkout page for the chosen wallet. Admin rows for it are stored as
   *  mode="api" (api_provider="paywise"), and that used to route the player into the
   *  legacy /initiate endpoint — a dead end. Any paywise API channel uses the create
   *  flow, so the pay button always reaches the gateway that actually works. */
  const isPaywise = /paywise/i.test(String(selected?.api_provider ?? "")) || selected?.id === "PayWise";
  const isApi = selected?.mode === "api" && !isPaywise;
  /** PayWise-style hosted checkout: the server mints a per-method checkout URL and the
   *  player pays on that page, so the screen shows the reference + method picker. */
  const isLink = selected?.mode === "link" || (selected?.mode === "api" && isPaywise);

  /** Wallets the picker may offer. Server sends `methods`; fall back sensibly. */
  const methods = useMemo<string[]>(() => {
    if (!isLink) return [];
    const fromServer = selected?.methods ?? [];
    if (fromServer.length) return fromServer;
    const configured = Object.keys(selected?.method_urls ?? {}).filter(k => (selected?.method_urls?.[k] || "").trim());
    if (configured.length) return configured;
    if (selected?.gateway_url || selected?.checkout_url) return ["bKash", "Nagad", "Upay"];
    return ["bKash", "Nagad", "Upay"];
  }, [isLink, selected]);

  const minC = selected?.min_amount_cents ?? 10000;
  const maxC = selected?.max_amount_cents ?? 25000000;
  const cents = useMemo(() => parseTakaToCents(amount), [amount]);
  const amountOk = Number.isFinite(cents) && cents >= minC && cents <= maxC;

  /** Crypto deposit — PayWise gives a real address + exact amount for the coin. */
  async function startCrypto() {
    const usdt = Number(amount);
    if (!Number.isFinite(usdt) || usdt < 1) return showToast(T("Minimum is 1 USDT", "সর্বনিম্ন ১ USDT"));
    setBusy(true);
    try {
      const r = await fetch("/api/payments/paywise/crypto", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ coin, amount_usdt: usdt }),
      }).then(r => r.json().catch(() => null));
      if (r?.ok) {
        setCrypto({
          coin: String(r.coin), network: String(r.network), address: String(r.pay_address),
          payAmount: String(r.pay_amount), amountUsdt: String(r.amount),
          checkoutUrl: String(r.checkout_url || ""), trxRef: String(r.trx_ref),
        });
        setPwRef(String(r.trx_ref));
        return;
      }
      showToast(r?.message || r?.error || T("Could not start the crypto payment", "ক্রিপ্টো পেমেন্ট শুরু করা যায়নি"));
    } catch {
      showToast(T("Network error — try again", "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন"));
    } finally { setBusy(false); }
  }

  /** Open the real PayWise checkout page for this request.
   *
   *  The button must be a live door, not a cached one: PayWise checkout links are
   *  single-use, so re-opening the stored URL shows "Reference exist with existing
   *  Merchant" (or a stale amount after the player edits it). Always ask the server for
   *  a fresh link; the previous attempt is retired server-side via `previous_ref`.
   *  Crediting is unaffected — the webhook matches the reference it was created with. */
  /**
   * Mint the PayWise checkout link for this attempt.
   *
   * NOTE: this only *prepares* the link. It must never be the thing that opens it —
   * `window.open` after an `await` has lost the user gesture and mobile Chrome (and
   * the Android WebView) silently blocks it. That is why the wallet buttons used to
   * do nothing on a phone. The player now taps a real <a> (see the pay step), which
   * the browser always honours. Crypto always worked because it used an <a> too.
   */
  async function mintCheckout(): Promise<string> {
    if (payState === "paid") { showToast(T("This deposit is already credited ✅", "এই ডিপোজিট ইতিমধ্যে যোগ হয়েছে ✅")); return ""; }
    setBusy(true);
    try {
      const r = await fetch("/api/payments/paywise/create", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, method: payMethod, amount_cents: cents, previous_ref: pwRef || undefined }),
      }).then(r => r.json().catch(() => null));
      if (r?.ok && r.checkout_url) {
        if (r.trx_ref) setPwRef(String(r.trx_ref));
        setCheckoutUrl(String(r.checkout_url));
        setPayState("idle");
        return String(r.checkout_url);
      }
      if (r?.message) showToast(String(r.message));
    } catch {
      showToast(T("Network error — try again", "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন"));
    } finally { setBusy(false); }
    return "";
  }

  /** Ask the server what PayWise says about this reference (credits if paid). */
  async function checkStatus() {
    if (!pwRef) return;
    setPayState("pending");
    try {
      const r = await fetch("/api/payments/paywise/status", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ trx_ref: pwRef }),
      }).then(r => r.json().catch(() => null));
      if (r?.status === "paid" && r?.credited) {
        setPayState("paid");
        showToast(T("✅ Deposit successful — balance updated", "✅ ডিপোজিট সফল — ব্যালেন্সে যোগ হয়েছে"));
        loadHistory(); loadBalance();
        return;
      }
      setPayState("idle");
      showToast(
        r?.status === "pending" ? T("PayWise has not confirmed the payment yet — try again in a minute", "PayWise এখনো পেমেন্ট নিশ্চিত করেনি — এক মিনিট পর আবার দেখুন")
        : r?.status === "failed" ? T("PayWise says the payment failed or expired", "PayWise বলছে পেমেন্ট ব্যর্থ বা মেয়াদ শেষ")
        : T("No payment found for this reference yet", "এই রেফারেন্সে এখনো কোনো পেমেন্ট পাওয়া যায়নি")
      );
    } catch {
      setPayState("idle");
      showToast(T("Network error — try again", "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন"));
    }
  }

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text.replace(/[-\s]/g, "")); setCopied(label); window.setTimeout(() => setCopied(null), 1600); }
    catch { showToast(T("Copy failed — long-press to copy", "কপি হয়নি — চেপে ধরে কপি করুন")); }
  };

  /* step 1 → step 2 (manual channels) or straight into the gateway (api) */
  async function next() {
    if (!Number.isFinite(cents)) return showToast(T("Enter an amount", "পরিমাণ লিখুন"));
    if (cents < minC) return showToast(T(`Minimum deposit ${taka(minC)}`, `সর্বনিম্ন ডিপোজিট ${taka(minC)}`));
    if (cents > maxC) return showToast(T(`Maximum deposit ${taka(maxC)}`, `সর্বোচ্চ ডিপোজিট ${taka(maxC)}`));

    if (isApi) {
      setBusy(true);
      try {
        const r = await fetch("/api/payments/paywise/initiate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel, amount_cents: cents }),
        }).then(r => r.json().catch(() => null));
        if (r?.ok && r?.redirect_url) { window.location.assign(String(r.redirect_url)); return; }
        if (r?.error === "paywise_not_configured" || r?.error === "gateway_not_configured") {
          setStep("pay");
          return showToast(T("Gateway is not configured — please contact support", "গেটওয়ে কনফিগার করা নেই — সাপোর্টে জানান"));
        }
        return showToast(r?.message || r?.error || T("Gateway error — try again", "গেটওয়ে ত্রুটি — আবার চেষ্টা করুন"));
      } catch {
        return showToast(T("Network error — try again", "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন"));
      } finally { setBusy(false); }
    }
    if (isLink) {
      setBusy(true);
      setGwError(null);
      try {
        const r = await fetch("/api/payments/paywise/create", {
          method: "POST", headers: { "content-type": "application/json" },
          // previous_ref lets the server retire the attempt we are replacing: PayWise
          // checkout links are single-use, so the old one can never be paid.
          body: JSON.stringify({ channel, method: payMethod, amount_cents: cents, previous_ref: pwRef || undefined }),
        }).then(r => r.json().catch(() => null));
        if (r?.ok && r?.trx_ref) {
          setPwRef(String(r.trx_ref));
          setCheckoutUrl(String(r.checkout_url || ""));
          if (r.method) setPayMethod(String(r.method));
          // Stay on the pay step underneath so the player has a working fallback link
          // if the redirect is interrupted (slow network, back button).
          setStep("pay");
          setPayState("idle");
          /* ONE TAP, STRAIGHT TO THE PAYMENT PAGE.
           *
           * Choosing wallet + amount and pressing Pay must land on the PayWise payment
           * page itself — not on a second "Pay with …" screen the player has to tap
           * again. Every extra screen is a place to drop out.
           *
           * window.location.assign is a top-level navigation, not a popup, so unlike
           * window.open it is NOT blocked after an await on mobile Chrome or a WebView. */
          if (r.checkout_url) {
            window.location.assign(String(r.checkout_url));
            return;
          }
          return;
        }
        if (r?.code || r?.error) {
          const code = String(r.code || r.error);
          // "channel unavailable" simply means this wallet has no active admin row — the
          // gateway row carries the limits instead, so retry through it rather than fail.
          if (code === "channel unavailable" || code === "method_not_supported") {
            setGwError(null);
            return showToast(T("Choose your wallet below and try again", "নিচে ওয়ালেট বেছে আবার চেষ্টা করুন"));
          }
          setGwError({ code, message: String(r.message || r.error) });
          if (r?.guide) setGuide(r.guide);
          setStep("pay");
          // VALIDATION_ERROR means PayWise's merchant account simply has no such rail
          // (bKash/Nagad/Upay collections are not enabled) — the one thing that DOES
          // work on this account is the USDT rail, so offer it rather than a dead end.
          if (/VALIDATION_ERROR|PAYMENT_METHOD_NOT_APPROVED|PW_MERCHANT_ACCESS_REQUIRED/i.test(code)) setNoBdtRail(true);
          return showToast(String(r.message || r.error));
        }
        return showToast(T("Could not start the payment", "পেমেন্ট শুরু করা যায়নি"));
      } catch {
        return showToast(T("Network error — try again", "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন"));
      } finally { setBusy(false); }
    }
    setStep("pay");
  }

  async function submit() {
    if (trx.trim().length < 4) return showToast(
      isLink ? T("Enter the TrxID from your PayWise payment", "PayWise পেমেন্টের TrxID দিন")
             : T("Enter the TrxID from your wallet SMS", "ওয়ালেট SMS থেকে TrxID দিন")
    );
    setBusy(true);
    try {
      const r = await fetch("/api/cashier/request", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_type: "DEPOSIT", channel, account_ref: accountRef, trx_ref: trx.trim(), amount_cents: cents }),
      }).then(r => r.json());
      if (!r.ok) return showToast(r.error || T("Request failed", "অনুরোধ ব্যর্থ হয়েছে"));
      showToast(T("✅ Request submitted — pending admin approval", "✅ অনুরোধ জমা হয়েছে — অ্যাডমিন অনুমোদনের অপেক্ষায়"));
      setTrx(""); setAccountRef(""); setStep("amount");
      loadHistory(); loadBalance();
    } finally { setBusy(false); }
  }

  /* ── signed-out ─────────────────────────────────────────────────────── */
  if (!user) return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 pt-20 text-center">
      <LockKeyhole size={44} className="text-[#F5B800]/70" strokeWidth={1.5} />
      <p className="text-sm font-bold text-white/80">{T("Login to make a deposit", "ডিপোজিট করতে লগইন করুন")}</p>
      <button onClick={onAuthClick} className="gold-btn h-11 rounded-xl px-6 text-sm">{T("Login / Register", "লগইন / রেজিস্টার")}</button>
    </div>
  );

  return (
    // Clearance for the fixed footer (balance + last deposit + CTA) plus the bottom nav,
    // so the history at the end of the page is never hidden behind it.
    <div className="pb-[240px]">
      {/* ── 1. title row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-1 pb-2">
        <button onClick={() => (onBack ? onBack() : goTab?.("home"))} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Back", "ফিরে যান")}>
          <ChevronLeft size={19} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-black tracking-wide text-white">{T("Deposit", "জমা দিন")}</h1>
        <button onClick={() => showToast(T("You're all caught up", "নতুন কোনো নোটিফিকেশন নেই"))} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/80 active:scale-90" aria-label={T("Notifications", "নোটিফিকেশন")}>
          <Bell size={17} />
          {history.some(h => h.status === "PENDING") && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{history.filter(h => h.status === "PENDING").length}</span>}
        </button>
        <Link href="/member/support" prefetch className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-[#F5B800] active:scale-90" aria-label={T("Support", "সাপোর্ট")}>
          <Headset size={17} />
        </Link>
      </div>

      <div className="space-y-2.5 px-3">
        {/* ── 2. currency tabs ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-[#1B1B1B] p-1">
          <button onClick={() => { setAsset("bdt"); setStep("amount"); }}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-black ${asset === "bdt" ? "bg-gradient-to-r from-[#e2136e] to-[#c2105f] text-white shadow-lg" : "text-white/55"}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${asset === "bdt" ? "bg-white/25" : "bg-white/10"}`}>৳</span>
            BDT
          </button>
          <button onClick={() => { setAsset("crypto"); setChannel("PayWise"); setStep("amount"); }}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-black ${asset === "crypto" ? "bg-gradient-to-r from-[#F5B800] to-[#c98f00] text-[#241a00] shadow-lg" : "text-white/55"}`}>
            <span className="text-[11px]">◈</span> Crypto
          </button>
        </div>

        {/* ══ CRYPTO — the rail PayWise actually switched on for this merchant ══ */}
        {asset === "crypto" && (
          <section className="card-metal tab-in rounded-2xl p-3">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F5B800]" />
              <h2 className="text-[12px] font-black text-white">{T("Crypto deposit via PayWise", "PayWise দিয়ে ক্রিপ্টো ডিপোজিট")}</h2>
            </div>

            <p className="mt-2 rounded-lg border border-[#F5B800]/40 bg-[#F5B800]/10 px-2.5 py-2 text-[10px] font-bold leading-relaxed text-[#F5B800]/90">
              {T(
                "bKash / Nagad are still waiting for PayWise approval. Crypto works right now — send the exact amount shown and the balance is credited automatically.",
                "bKash / Nagad এখনো PayWise-এর অনুমোদনের অপেক্ষায়। ক্রিপ্টো এখনই কাজ করে — দেখানো পরিমাণ পাঠালে ব্যালেন্স স্বয়ংক্রিয়ভাবে যোগ হবে।"
              )}
            </p>

            <label className="mt-3 block text-[9px] font-bold uppercase tracking-widest text-white/45">{T("Coin", "কয়েন")}</label>
            <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-[#F5B800]/40 bg-[#F5B800]/10 px-2.5 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26A17B] text-[9px] font-black text-white">₮</span>
              <span className="flex-1 text-[12px] font-black text-white">USDT</span>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-white/80">BEP20 · BNB Chain</span>
            </div>
            <p className="mt-1 text-[9px] leading-snug text-white/40">
              {T("Other coins are not enabled by PayWise for this account yet.", "অন্য কয়েন এখনো PayWise এই অ্যাকাউন্টের জন্য চালু করেনি।")}
            </p>

            <label className="mt-3 block text-[9px] font-bold uppercase tracking-widest text-white/45">
              {T("Amount (USDT)", "পরিমাণ (USDT)")}
            </label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
              placeholder="10"
              className="mt-1 h-12 w-full rounded-xl border border-[#F5B800]/40 bg-black/45 px-3 text-[15px] font-black tabular-nums text-white" />
            <p className="mt-1 text-[9px] text-white/40">
              {T("Minimum 1 USDT. PayWise adds its network fee on top — the exact figure is shown next.", "সর্বনিম্ন ১ USDT। PayWise-এর নেটওয়ার্ক ফি যুক্ত হবে — ঠিক কত পাঠাতে হবে পরের ধাপে দেখানো হবে।")}
            </p>

            {crypto ? (
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/[.07] p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">{T("Send exactly", "ঠিক এত পাঠান")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex-1 text-[18px] font-black tabular-nums text-white">{crypto.payAmount} {crypto.coin}</span>
                    <button onClick={() => copy(crypto.payAmount, "amt")}
                      className="rounded-lg border border-[#F5B800]/50 bg-[#F5B800]/10 px-2 py-1.5 text-[9px] font-black text-[#F5B800]">
                      {copied === "amt" ? T("Copied", "কপি হয়েছে") : T("Copy", "কপি")}
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] text-white/55">{crypto.network ? `${T("Network", "নেটওয়ার্ক")}: ${crypto.network}` : ""}</p>
                </div>

                <div className="rounded-xl border border-white/12 bg-black/45 p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/45">{T("Deposit address", "ডিপোজিট ঠিকানা")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex-1 break-all font-mono text-[11px] font-bold text-white">{crypto.address}</span>
                    <button onClick={() => copy(crypto.address, "addr")}
                      className="shrink-0 rounded-lg border border-[#F5B800]/50 bg-[#F5B800]/10 px-2 py-1.5 text-[9px] font-black text-[#F5B800]">
                      {copied === "addr" ? T("Copied", "কপি হয়েছে") : T("Copy", "কপি")}
                    </button>
                  </div>
                </div>

                {crypto.checkoutUrl ? (
                  <a href={crypto.checkoutUrl} target="_blank" rel="noopener noreferrer"
                    className="gold-btn flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[12px]">
                    <ShieldCheck size={15} /> {T("Open the PayWise payment page", "PayWise পেমেন্ট পেজ খুলুন")}
                  </a>
                ) : null}

                <button onClick={() => checkStatus()}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[.03] text-[10px] font-black text-white/70">
                  <Loader2 size={12} className={payState === "pending" ? "animate-spin" : ""} />
                  {T("I have paid — check status", "পেমেন্ট করেছি — স্ট্যাটাস দেখুন")}
                </button>
                <p className="text-[9px] leading-snug text-white/40">
                  {T("Sending on another network or a smaller amount will not be credited.",
                     "অন্য নেটওয়ার্কে বা কম পরিমাণ পাঠালে ব্যালেন্স যোগ হবে না।")}
                </p>
              </div>
            ) : (
              <button onClick={startCrypto} disabled={busy}
                className="gold-btn mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl text-[13px]">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}
                {T("Get deposit address", "ডিপোজিট ঠিকানা নিন")}
              </button>
            )}
          </section>
        )}

        {asset === "bdt" && step === "amount" && (
          <>
        {/* ── 3. আমানতের মোড — only wallets that need a number of their own ────
            The PayWise row used to sit here as a big "PayWise · AUTO" tile, which only
            repeated the picker inside the pay block (and hid the wallets the player
            actually chooses). The gateway wallets live in that block now, so this section
            hides itself unless an operator has added a real manual Send-Money row. */}
        {channels.some(c => c.mode !== "api" && c.id !== "PayWise") && (
        <Section
          title={T("Deposit mode", "আমানতের মোড")}
          note={channels.length > 3 ? T(`${channels.length} wallets connected — pick one`, `${channels.length}টি ওয়ালেট যুক্ত — একটি বেছে নিন`) : undefined}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {channels.filter(c => c.mode !== "api" && c.id !== "PayWise").map((c, i) => {
              const active = channel === c.id;
              return (
                <button key={c.id} onClick={() => { setChannel(c.id); setStep("amount"); }}
                  className={`relative flex items-center gap-1.5 rounded-xl border p-1.5 text-left transition-all ${active ? "border-[#F5B800] bg-[#F5B800]/10 ring-1 ring-[#F5B800]/50" : "border-white/10 bg-white/[.03]"}`}>
                  {i === 0 && <span className="absolute -left-1 -top-1 text-[11px] drop-shadow">🔥</span>}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
                    {c.logo
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={c.logo} alt={c.name} className="h-full w-full object-contain" />
                      : <span className="text-[12px] font-black text-white" style={{ color: c.color }}>{c.id.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[7.5px] font-semibold leading-tight text-white/45">
                      {c.mode === "link" ? T("Pay online", "অনলাইনে") : T("Send Money", "সেন্ড মানি")}
                    </span>
                    <span className="block break-words text-[10px] font-black leading-[1.15] text-white">{c.name}</span>
                  </span>
                  {c.mode === "api" && <span className="absolute right-1 top-1 rounded bg-emerald-400/20 px-1 text-[6px] font-black tracking-wider text-emerald-300">AUTO</span>}
                  {c.mode === "link" && <span className="absolute right-1 top-1 rounded bg-[#F5B800]/25 px-1 text-[6px] font-black tracking-wider text-[#F5B800]">GATEWAY</span>}
                </button>
              );
            })}
          </div>
        </Section>
        )}

        {/* ── 3b. top row: the wallet itself ───────────────────────────────
            This is the choice that drives everything below — which gateway rail is used
            and which number/manual steps appear. It sits above the amount. */}
        {isLink && methods.length > 0 && (
          <Section title={T("Pay with", "যে মাধ্যমে পেমেন্ট করবেন")}>
            <div className={`grid gap-1.5 ${methods.length >= 3 ? "grid-cols-3" : methods.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {methods.map(m => {
                const on = payMethod === m;
                return (
                  <button key={m} onClick={() => { if (m !== payMethod) { setPayMethod(m); setCheckoutUrl(""); setGwError(null); setNoBdtRail(false); setPayState("idle"); } }}
                    className={`flex items-center gap-1.5 rounded-xl border p-2 ${on ? "border-[#F5B800] bg-[#F5B800]/10 ring-1 ring-[#F5B800]/40" : "border-white/10 bg-white/[.03]"}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
                      {CHANNEL_STYLE[m]?.logo
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={CHANNEL_STYLE[m].logo} alt={m} className="h-full w-full object-contain" />
                        : <span className="text-[10px] font-black" style={{ color: CHANNEL_STYLE[m]?.color || "#111" }}>{m.slice(0, 2)}</span>}
                    </span>
                    <span className={`text-[11px] font-black ${on ? "text-[#F5B800]" : "text-white/80"}`}>{m}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[9px] leading-snug text-white/40">
              {T(`Limits ${taka(minC)} – ${taka(maxC)} per payment`, `প্রতি পেমেন্টে সীমা ${taka(minC)} – ${taka(maxC)}`)}
            </p>
          </Section>
        )}

        {/* ── 5. জমা পরিমাণ ─────────────────────────────────────────── */}
        <Section title={T("Deposit amount", "জমা পরিমাণ")}>
          <div className="flex h-12 items-center rounded-xl border border-white/12 bg-black/45 px-3">
            <span className="mr-2 text-[15px] font-black text-[#F5B800]">৳</span>
            <input
              value={amount}
              onChange={e => { setAmount(e.target.value.replace(/[^\d]/g, "")); setStep("amount"); }}
              inputMode="numeric"
              placeholder={T("Enter amount", "পরিমাণ লিখুন")}
              className="w-full border-0 bg-transparent text-[17px] font-black tabular-nums text-white !shadow-none placeholder:text-[13px] placeholder:font-semibold placeholder:text-white/25"
            />
            {amount && <button onClick={() => setAmount("")} className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/50" aria-label={T("Clear", "মুছুন")}><X size={11} /></button>}
            <button onClick={() => setAmount(String(Math.floor(maxC / 100)))} className="ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe066] to-[#e0a400] text-[#1a1300] active:scale-90" aria-label={T("Maximum", "সর্বোচ্চ")}>↑</button>
          </div>
          <p className={`mt-1 text-[9px] font-semibold ${amount && !amountOk ? "text-red-400" : "text-white/40"}`}>
            {T(`Range: ${taka(minC)} - ${taka(maxC)}`, `সীমা: ${taka(minC)} - ${taka(maxC)}`)}
            {amount && !amountOk && <span className="ml-1">{Number.isFinite(cents) && cents < minC ? T("· below minimum", "· সর্বনিম্নের নিচে") : T("· above maximum", "· সর্বোচ্চের বেশি")}</span>}
          </p>
          {/* The deposit floor (৳300) is lower than the bonus gate (৳500). Say so up
              front: a player who deposits ৳300 gets their money credited but does not
              unlock deposit bonuses, and they should not find that out afterwards. */}
          {minC < rules.bonus_min_deposit_cents && (
            <p className="mt-1 rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-[8px] leading-snug text-white/45">
              {T(
                `Deposits from ${taka(minC)} are accepted. Bonuses unlock after one deposit of ${takaRound(rules.bonus_min_deposit_cents)} or more.`,
                `${taka(minC)} থেকে ডিপোজিট গ্রহণ করা হয়। ${takaRound(rules.bonus_min_deposit_cents)} বা তার বেশি একটি ডিপোজিট করলে বোনাস আনলক হয়।`
              )}
            </p>
          )}
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {/* Only amounts the gateway actually accepts are offered — the filter below
                reads the live min/max from deposit_channels, so a chip can never be a
                guaranteed failure. (PayWise is ৳300-৳25,000 today.) */}
            {QUICK.filter(q => q * 100 >= minC && q * 100 <= maxC).map(q => {
              const on = amount === String(q);
              return (
                <button key={q} onClick={() => { setAmount(String(q)); setStep("amount"); }}
                  className={`h-9 rounded-lg border text-[11px] font-black tabular-nums transition-all ${on ? "border-[#F5B800] bg-[#F5B800]/15 text-[#F5B800]" : "border-white/10 bg-white/[.04] text-white/70"}`}>
                  {q.toLocaleString("en-IN")}
                </button>
              );
            })}
          </div>
        </Section>
          </>
        )}

        {/* ══ 5b. one screen: pick wallet → pay → paste the TrxID ═══════════
            Previously this was a second step that repeated the amount, the gateway card
            and the reference — the player had to scroll past their own instructions. It is
            now one compact block under the amount, and it only appears once an amount the
            gateway actually accepts has been typed. */}
        {asset === "bdt" && (step === "pay" || (isLink && amountOk)) && (
          <section className="card-metal tab-in rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <h2 className="text-[12px] font-black text-white">
                  {isLink ? T("Pay with PayWise", "PayWise দিয়ে পেমেন্ট করুন") : T("Pay to this wallet", "এই ওয়ালেটে টাকা পাঠান")}
                </h2>
              </div>
              <span className="text-[11px] font-black tabular-nums text-[#F5B800]">{taka(cents || 0)}</span>
            </div>

            {/* the exact amount matters with every rail here, gateway or wallet */}
            <p className="mt-1.5 text-[9px] font-bold leading-snug text-white/50">
              {T(
                `Pay exactly ${taka(cents || 0)} — a different amount is not credited.`,
                `ঠিক ${taka(cents || 0)} পাঠান — ভিন্ন পরিমাণ হলে ক্রেডিট হবে না।`
              )}
            </p>

            {isLink ? (
              <div className="mt-2 space-y-2">
                {payState === "paid" ? (
                  <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-black text-emerald-300">
                      <CheckCircle2 size={14} /> {T("Payment received — balance updated", "পেমেন্ট পাওয়া গেছে — ব্যালেন্স যোগ হয়েছে")}
                    </p>
                  </div>
                ) : gwError ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-2.5">
                      <p className="text-[10px] font-semibold leading-relaxed text-red-200/90">{gwError.message}</p>
                    </div>
                    {guide?.account_number && (
                      <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/[.07] p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">
                          {T("Pay here instead", "এর বদলে এখানে পাঠান")} · {guide.account_label || payMethod}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="flex-1 text-[16px] font-black tabular-nums tracking-wide text-white">{guide.account_number}</span>
                          <button onClick={() => copy(guide.account_number, "num")}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-black ${copied === "num" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-[#F5B800]/50 bg-[#F5B800]/10 text-[#F5B800]"}`}>
                            {copied === "num" ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                            {copied === "num" ? T("Copied", "কপি হয়েছে") : T("Copy", "কপি")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* A genuine <a> to the minted checkout page. Popup blockers and mobile
                        browsers reject window.open() after an await; a tapped anchor is
                        always honoured, and this is exactly how the crypto rail works. */}
                    {checkoutUrl ? (
                      /* Straight to the PayWise payment page in THIS tab. The player is
                         paying now, not browsing, so a new tab just leaves a dead tab
                         behind on a phone. No target=_blank, and no popup to be blocked. */
                      <a href={checkoutUrl} rel="noreferrer"
                        onClick={() => setPayState("pending")}
                        className="gold-btn flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px]">
                        <ShieldCheck size={15} />
                        {T(`Pay with ${payMethod}`, `Pay with ${payMethod}`)}
                      </a>
                    ) : (
                      <button onClick={() => next()} disabled={busy}
                        className="gold-btn flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] disabled:opacity-50">
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                        {T(`Pay with ${payMethod}`, `Pay with ${payMethod}`)}
                      </button>
                    )}
                    {checkoutUrl && (
                      <button onClick={() => { mintCheckout(); }}
                        className="flex h-7 w-full items-center justify-center gap-1 text-[9px] font-black text-white/45">
                        {T("Link not opening? Get a fresh one", "লিংক খুলছে না? নতুন লিংক নিন")}
                      </button>
                    )}
                    <button onClick={() => checkStatus()}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[.03] text-[10px] font-black text-white/70">
                      <Loader2 size={12} className={payState === "pending" ? "animate-spin" : ""} />
                      {T("I have paid — check status", "পেমেন্ট করেছি — স্ট্যাটাস দেখুন")}
                    </button>
                  </>
                )}

                {/* the reference only exists once a checkout was minted, so only show it then */}
                {pwRef && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#F5B800]/30 bg-black/40 px-2.5 py-1.5">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{T("Reference", "রেফারেন্স")}</span>
                    <span className="flex-1 truncate font-mono text-[12px] font-black tracking-wide text-white">{pwRef}</span>
                    <button onClick={() => copy(pwRef, "ref")}
                      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[8.5px] font-black ${copied === "ref" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-[#F5B800]/50 bg-[#F5B800]/10 text-[#F5B800]"}`}>
                      {copied === "ref" ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <label className="mt-2 block text-[9px] font-bold uppercase tracking-widest text-white/45">{T("Wallet number", "ওয়ালেট নম্বর")} *</label>
                <div className="mt-1 flex h-11 items-center rounded-xl border border-white/12 bg-black/45 px-3">
                  <span className="flex-1 text-[14px] font-black tabular-nums tracking-wide text-white">{selected?.account_number || "—"}</span>
                  <button onClick={() => copy(selected?.account_number || "", "num")}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-black transition-colors ${copied === "num" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-[#F5B800]/50 bg-[#F5B800]/10 text-[#F5B800]"}`}>
                    {copied === "num" ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                    {copied === "num" ? T("Copied", "কপি হয়েছে") : T("Copy", "কপি")}
                  </button>
                </div>
                <p className="mt-1 text-[9px] leading-snug text-white/40">
                  {T("Send Money only — no Cash Out, no Add Money.", "শুধুমাত্র সেন্ড মানি করুন — ক্যাশ আউট বা অ্যাড মানি নয়।")}
                  {selected?.reference ? <> · {T("Reference", "রেফারেন্স")}: <span className="font-black text-white/70">{selected.reference}</span></> : null}
                </p>
              </>
            )}

            {/* Manual TrxID entry only exists for rails where the player sends money to a
                wallet number themselves. On the PayWise gateway the payment page collects
                everything and the signed webhook credits it, so asking for a TrxID here is
                a dead end — it just invites players to type a wrong code. */}
            {!isLink && (
              <>
                <label className="mt-2.5 block text-[9px] font-bold uppercase tracking-widest text-white/45">{T("Transaction ID (TrxID)", "TrxID নম্বর")} *</label>
                <input value={trx} onChange={e => setTrx(e.target.value.toUpperCase())} autoCapitalize="characters"
                  placeholder={T("TrxID is required!", "TrxID অবশ্যই পূরণ করতে হবে!")}
                  className="mt-1 h-11 w-full rounded-xl border border-[#F5B800]/40 bg-black/45 px-3 text-[13px] font-bold tracking-widest text-white placeholder:text-[11px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-white/25" />

                <div className="mt-2 flex gap-2">
                  <input value={accountRef} onChange={e => setAccountRef(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" maxLength={11}
                    placeholder={T("Your number (optional)", "আপনার নম্বর (ঐচ্ছিক)")}
                    className="h-11 flex-1 rounded-xl border border-white/12 bg-black/45 px-3 text-[12px] tabular-nums text-white placeholder:text-[11px] placeholder:font-semibold placeholder:text-white/25" />
                  <button onClick={submit} disabled={busy} className="gold-btn flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px]">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    {T("Confirm", "নিশ্চিত")}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── history — always the last row on the page ───────────────── */}
        <div className="pb-1">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/55"><History size={11} />{T("Deposit history", "ডিপোজিট ইতিহাস")}</h2>
          <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-0.5">
            {history.length === 0 && <p className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[10px] text-white/30">{T("No deposits yet", "কোনো ডিপোজিট নেই")}</p>}
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#1E1E1E] px-2.5 py-2">
                <Receipt size={14} className="shrink-0 text-white/35" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-white/85">
                    {h.channel} · <span className="text-[#F5B800]">
                      {/* crypto rows are recorded in the coin, not taka */}
                      {/CRYPTO/i.test(String(h.channel)) ? `${(h.amount_cents / 100).toFixed(2)} USDT` : formatTaka(h.amount_cents)}
                    </span>
                  </p>
                  <p className="truncate text-[8px] tabular-nums text-white/35">{h.trx_ref || "—"} · {new Date(h.created_at).toLocaleString(bn ? "bn-BD" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <StatusChip s={h.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. sticky footer: totals + confirm (BDT flow) ──────────── */}
      {asset === "bdt" && (
      <div className="fixed bottom-[68px] left-0 right-0 z-30 mx-auto w-full max-w-[480px] lg:max-w-[1180px] border-t border-[#F5B800]/25 bg-[#141414]/98 px-3 pt-1.5 pb-1.5 backdrop-blur-md">
        {/* balance change since this page was opened — the only running figure that helps
            here; the deposit/withdraw/bonus totals were noise and are gone. */}
        <div className="flex items-baseline justify-between gap-2 text-[9.5px]">
          <span className="font-bold text-white/40">{T("Balance change", "ব্যালেন্স পরিবর্তন")}</span>
          <span className={`font-black tabular-nums ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-white/50"}`}>
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}{taka(Math.abs(delta))}
            <span className="ml-1 font-bold text-white/35">
              {T("now", "এখন")} {taka(balance)}
            </span>
          </span>
        </div>
        {history[0] && (
          <p className="mt-0.5 flex items-center gap-1 text-[9px] text-white/35">
            <History size={9} className="shrink-0" />
            <span className="truncate">
              {T("Last deposit", "সর্বশেষ ডিপোজিট")} · {history[0].channel} {formatTaka(history[0].amount_cents)} · {history[0].status}
            </span>
          </p>
        )}
        {/* One screen now: the form is right above, so the CTA is the same action —
            paste the TrxID and confirm, or open the payment page if that has not happened. */}
        {/* One CTA per screen. On the PayWise gateway the action already lives in the pay
            card above (the "Pay with …" link), so this second bar was a duplicate that
            also sat under the finger and caught stray taps. */}
        {!isLink && (
          <button onClick={() => (trx.trim() ? submit() : next())} disabled={busy}
            className="gold-btn mt-1.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[14px]">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />}
            {T("Confirm deposit", "ডিপোজিট নিশ্চিত করুন")}
          </button>
        )}
      </div>
      )}

      {/* ── "More" channel sheet ─────────────────────────────────────── */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70" onClick={() => setMoreOpen(false)}>
          <div className="w-full max-w-[480px] rounded-t-2xl border-t border-[#F5B800]/30 bg-[#171717] p-3 pb-5" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-black text-white">{T("All payment channels", "সব পেমেন্ট চ্যানেল")}</h3>
              <button onClick={() => setMoreOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60"><X size={14} /></button>
            </div>
            <div className="space-y-1.5">
              {channels.map(c => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-[#1E1E1E] px-2.5 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
                    {c.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.logo} alt={c.name} className="h-full w-full object-contain" /> : <span className="text-[11px] font-black" style={{ color: c.color }}>{c.id.slice(0, 1)}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-white">{c.name} <span className="text-[8px] font-semibold text-white/40">{c.account_label}</span></p>
                    <p className="truncate text-[9px] tabular-nums text-white/45">{c.account_number}</p>
                    <p className="text-[8px] text-[#F5B800]/70">{T(`Limit ${taka(c.min_amount_cents)} - ${taka(c.max_amount_cents)}`, `সীমা ${taka(c.min_amount_cents)} - ${taka(c.max_amount_cents)}`)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => copy(c.account_number, `m-${c.id}`)} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[8.5px] font-black ${copied === `m-${c.id}` ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300" : "border-[#F5B800]/50 bg-[#F5B800]/10 text-[#F5B800]"}`}>
                      {copied === `m-${c.id}` ? <CheckCircle2 size={10} /> : <Copy size={10} />} {T("Copy", "কপি")}
                    </button>
                    <button onClick={() => { setChannel(c.id); setStep("amount"); setMoreOpen(false); }} className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/[.04] px-2 py-1 text-[8.5px] font-black text-white/70">
                      <BadgeCheck size={10} /> {T("Use", "ব্যবহার")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1 text-[8.5px] leading-snug text-white/35"><Info size={10} className="mt-0.5 shrink-0" />{T("Wallet numbers are set by the operator in the admin panel — always copy them from here, never from a message.", "ওয়ালেট নম্বর অ্যাডমিন প্যানেল থেকে সেট হয় — সবসময় এখান থেকেই কপি করুন, কোনো মেসেজ থেকে নয়।")}</p>
          </div>
        </div>
      )}

      {supportOpen && <SupportChat onClose={() => setSupportOpen(false)} onAuthClick={() => { setSupportOpen(false); onAuthClick(); }} />}
    </div>
  );
}
