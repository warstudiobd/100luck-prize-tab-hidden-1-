"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  UserRound, Copy, Check, LogOut, LockKeyhole, History, ChevronDown, ChevronUp, Send,
  ArrowDownCircle, ArrowUpCircle, RotateCcw, BadgePlus, ShieldCheck, CheckCircle2, XCircle,
  Loader2, Banknote, BadgeCheck, Gift, ScrollText, Scale, ArrowDownToLine, ArrowUpFromLine,
  Users, Target, Percent, Mail, MessageCircleQuestion, Smartphone, Headset, ChevronLeft,
  RefreshCw, X, KeyRound, Share2, QrCode, CreditCard, Wallet, CalendarDays, CopyCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLang } from "../lang";
import ReferralShareModal from "../ReferralShareModal";
import RebateView from "./RebateView";
import MissionView from "./MissionView";
import MyRewardsView from "./MyRewardsView";
import VipView from "./VipView";
import InviteView from "./InviteView";
import { normaliseBdPhone, toIntlBdPhone } from "@/lib/phone";
import { formatTaka, parseTakaToCents } from "@/lib/format";
import type { TabKey } from "../BottomBar";
import type { CashierRequestRow, LedgerRow, SessionUser } from "@/lib/types";

function actionIcon(t: string) {
  switch (t) {
    case "DEBIT": return <ArrowDownCircle size={13} className="text-red-400" />;
    case "CREDIT": return <ArrowUpCircle size={13} className="text-emerald-400" />;
    case "ROLLBACK": return <RotateCcw size={13} className="text-amber-300" />;
    case "DEPOSIT": return <BadgePlus size={13} className="text-[#F5B800]" />;
    case "WITHDRAW": return <ArrowUpCircle size={13} className="text-orange-400" />;
    default: return <BadgePlus size={13} className="text-white/40" />;
  }
}
const signOf = (a: string) => (a === "DEBIT" || a === "WITHDRAW" ? "-" : "+");

function StatusChip({ s }: { s: string }) {
  const cls = s === "APPROVED" ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
    : s === "REJECTED" ? "text-red-400 border-red-400/40 bg-red-400/10"
    : "text-amber-300 border-amber-300/40 bg-amber-300/10";
  return <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wide ${cls}`}>{s}</span>;
}

export default function MemberView({ user, onAuthClick, onLogout, showToast, refreshUser, goTab }: {
  user: SessionUser | null; onAuthClick: () => void; onLogout: () => void;
  showToast: (m: string) => void; refreshUser: () => Promise<any>; goTab?: (t: TabKey) => void;
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [showLedger, setShowLedger] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [adminTab, setAdminTab] = useState(false);
  const [pending, setPending] = useState<CashierRequestRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [creditTarget, setCreditTarget] = useState("");
  const [creditAmount, setCreditAmount] = useState("500");
  const [creditBusy, setCreditBusy] = useState(false);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  // Full-screen sub-pages (member centre tiles) — these replace the whole view
  // rather than stacking a sheet over it, exactly like the 499bet flow.
  const [page, setPage] = useState<null | "rebate" | "mission" | "rewards" | "invite" | "vip">(null);
  // Logout asks first — a mistap on a 4-across grid should not end the session.
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [modal, setModal] = useState<null | "pnl" | "security" | "records" | "complaint" | "mycard">(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // Red counters on the member-center icons — real state, not decoration.
  const [badges, setBadges] = useState<{ spin: number; rewards: number; missions: number; rebate: number }>({ spin: 0, rewards: 0, missions: 0, rebate: 0 });
  const [recordsType, setRecordsType] = useState<"DEPOSIT" | "WITHDRAW" | "ALL">("ALL");
  const [records, setRecords] = useState<CashierRequestRow[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState("");
  const [complaintMsg, setComplaintMsg] = useState("");
  const [complaintBusy, setComplaintBusy] = useState(false);
  const ledgerRef = useRef<HTMLDivElement>(null);

  const loadBadges = useCallback(async () => {
    if (!user) { setBadges({ spin: 0, rewards: 0, missions: 0, rebate: 0 }); return; }
    const r = await fetch("/api/member/badges", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setBadges({
      spin: Number(r.spin) || 0, rewards: Number(r.rewards) || 0,
      missions: Number(r.missions) || 0, rebate: Number(r.rebate) || 0,
    });
  }, [user]);
  useEffect(() => { loadBadges(); }, [loadBadges]);

  const loadLedger = useCallback(async () => {
    if (!user) return;
    const r = await fetch("/api/wallet/ledger", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setLedger(r.entries.slice(0, 25));
  }, [user]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    const r = await fetch("/api/admin/pending", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (r?.ok) setPending(r.pending);
    setPendingLoading(false);
  }, []);

  const loadRecords = useCallback(async (type: "DEPOSIT" | "WITHDRAW" | "ALL") => {
    setRecordsLoading(true);
    const url = type === "ALL" ? "/api/cashier/history" : `/api/cashier/history?type=${type}`;
    const r = await fetch(url, { cache: "no-store" }).then(r => r.json()).catch(() => null);
    setRecords(r?.ok ? r.requests : []);
    setRecordsLoading(false);
  }, []);

  useEffect(() => { loadLedger(); }, [loadLedger]);
  useEffect(() => { setContactPhone(user?.phone ?? ""); }, [user?.id, user?.phone]);
  useEffect(() => { if (user?.is_admin && adminTab) loadPending(); }, [user?.is_admin, adminTab, loadPending]);
  useEffect(() => { if (modal === "records") loadRecords(recordsType); }, [modal, recordsType, loadRecords]);

  if (!user) return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 pt-20 text-center">
      <LockKeyhole size={44} className="text-[#F5B800]/70" strokeWidth={1.5} />
      <p className="text-sm font-bold text-white/80">{lang === "bn" ? "অ্যাকাউন্ট দেখতে লগইন করুন" : "Login to view your account"}</p>
      <button onClick={onAuthClick} className="gold-btn h-11 rounded-xl px-6 text-sm">{lang === "bn" ? "লগইন / রেজিস্টার" : "Login / Register"}</button>
    </div>
  );

  // Full-screen sub-pages replace the whole member view, like 499bet's /m/* routes.
  if (page === "rebate") return <RebateView showToast={showToast} onBack={() => { setPage(null); loadBadges(); }} />;
  if (page === "mission") return <MissionView showToast={showToast} onBack={() => { setPage(null); loadBadges(); }} user={user} />;
  const backToCentre = () => { setPage(null); loadBadges(); refreshUser(); };
  if (page === "vip") return <VipView showToast={showToast} onBack={backToCentre} refreshUser={refreshUser} />;
  if (page === "invite") return <InviteView showToast={showToast} onBack={backToCentre} referralCode={String(user.referral_code ?? "")} />;
  if (page === "rewards") return (
    <MyRewardsView
      user={{ id: user.id, balance_cents: user.balance_cents, vip_level: user.vip_level,
              phone: user.phone ?? null, username_or_phone: user.username_or_phone }}
      showToast={showToast}
      onBack={backToCentre}
      goRewards={() => { setPage(null); goTab?.("promo"); }}
      goInvite={() => setPage("invite")}
      goVip={() => setPage("vip")}
      refreshUser={refreshUser}
    />
  );

  const wagered = ledger.filter(e => e.action_type === "DEBIT").reduce((s, e) => s + e.amount_cents, 0);
  const won = ledger.filter(e => e.action_type === "CREDIT").reduce((s, e) => s + e.amount_cents, 0);
  const net = won - wagered;
  const contactMissing = !user.phone;
  const joinDate = new Date(user.created_at).toISOString().slice(0, 10);
  const idNo = String(1000000000 + user.id);

  async function saveContact(e?: React.FormEvent) {
    e?.preventDefault();
    // Players type the local number only — we add +880 behind the scenes for the
    // game provider, so nobody has to know or type a country code.
    const local = normaliseBdPhone(contactPhone);
    if (!local) {
      showToast(lang === "bn" ? "সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)" : "Enter a valid mobile number (01XXXXXXXXX)");
      return;
    }
    setContactBusy(true);
    try {
      const r = await fetch("/api/auth/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: toIntlBdPhone(local) }),
      }).then(r => r.json());
      if (!r.ok) { showToast(r.error_bn || r.error || (lang === "bn" ? "ফোন নম্বর সেভ করা যায়নি" : "Could not save phone number")); return; }
      await refreshUser();
      showToast(lang === "bn" ? "ফোন নম্বর সেভ হয়েছে — রিয়েল-মানি চালু করা যাবে" : "Phone number saved — real-money launch is unlocked");
    } catch {
      showToast(lang === "bn" ? "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন" : "Network error — please try again");
    } finally { setContactBusy(false); }
  }

  async function copyRef() {
    // Open the share sheet (link + QR + WhatsApp/Telegram + native share).
    setShareOpen(true);
  }

  async function copyPhone() {
    const p = user!.phone || user!.username_or_phone;
    try { await navigator.clipboard.writeText(p); setCopiedPhone(true); } catch { /* clipboard unavailable */ }
    window.setTimeout(() => setCopiedPhone(false), 1800);
  }

  /** Copy any profile field (phone / player ID / referral code) with a tick. */
  const copyField = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(c => (c === key ? null : c)), 1600);
      showToast(lang === "bn" ? "কপি হয়েছে" : "Copied");
    } catch {
      showToast(lang === "bn" ? "কপি করা যায়নি" : "Could not copy");
    }
  };

  function gotoLedger() {
    setShowLedger(true);
    window.setTimeout(() => ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function decide(id: number, decision: "APPROVE" | "REJECT") {
    setDecidingId(id);
    try {
      const r = await fetch("/api/cashier/decision", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision }),
      }).then(r => r.json());
      showToast(r.ok ? `✔ #${id} → ${decision === "APPROVE" ? (lang === "bn" ? "অনুমোদিত" : "APPROVED") : (lang === "bn" ? "বাতিল" : "REJECTED")}` : (r.error || (lang === "bn" ? "অনুরোধ ব্যর্থ হয়েছে" : "Request failed")));
      await loadPending(); await loadLedger(); await refreshUser();
    } finally { setDecidingId(null); }
  }

  async function creditUser(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseTakaToCents(creditAmount);
    if (!creditTarget.trim() || !Number.isFinite(cents) || cents <= 0) return showToast(lang === "bn" ? "ইউজারনেম ও সঠিক পরিমাণ দিন" : "Enter username + positive amount");
    setCreditBusy(true);
    try {
      const r = await fetch("/api/admin/credit", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username_or_phone: creditTarget.trim(), amount_cents: cents, note: "admin_test_credit" }),
      }).then(r => r.json());
      showToast(r.ok ? (lang === "bn" ? `✔ ${creditTarget}-এর ${formatTaka(cents)} ক্রেডিট হয়েছে` : `✔ ${creditTarget} credited ${formatTaka(cents)}`) : (r.error || (lang === "bn" ? "অনুরোধ ব্যর্থ হয়েছে" : "Request failed")));
      if (r.ok) { setCreditTarget(""); loadLedger(); refreshUser(); }
    } finally { setCreditBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew !== pwConfirm) { showToast(lang === "bn" ? "নতুন পাসওয়ার্ড মিলছে না" : "New passwords do not match"); return; }
    if (pwNew.length < 6) { showToast(lang === "bn" ? "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষর" : "New password must be at least 6 characters"); return; }
    setPwBusy(true);
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: pwCur, new_password: pwNew }),
      }).then(r => r.json());
      if (!r.ok) { showToast(r.error || (lang === "bn" ? "পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে" : "Could not change password")); return; }
      setPwCur(""); setPwNew(""); setPwConfirm("");
      showToast(lang === "bn" ? "✔ পাসওয়ার্ড পরিবর্তন হয়েছে" : "✔ Password changed");
    } catch { showToast(lang === "bn" ? "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন" : "Network error — try again"); }
    finally { setPwBusy(false); }
  }

  const comingSoon = () => showToast(lang === "bn" ? "🚧 শীঘ্রই আসছে — সাথে থাকুন!" : "🚧 Coming soon — stay tuned!");
  const openComplaint = () => setModal("complaint");
  const appToast = () => {
    // Profile → Download App should fetch the signed APK directly, just like the public Get App page.
    const link = document.createElement("a");
    link.href = "https://warstudio.site/download/100LUCK-1.0.0.apk";
    link.download = "100LUCK-1.0.0.apk";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const submitComplaint = async () => {
    if (complaintBusy) return;
    const subject = complaintSubject.trim();
    const message = complaintMsg.trim();
    if (subject.length < 3) { showToast(lang === "bn" ? "বিষয় লিখুন (কমপক্ষে ৩ অক্ষর)" : "Enter a subject (min 3 chars)"); return; }
    if (message.length < 10) { showToast(lang === "bn" ? "বার্তা লিখুন (কমপক্ষে ১০ অক্ষর)" : "Enter a message (min 10 chars)"); return; }
    setComplaintBusy(true);
    try {
      const r = await fetch("/api/complaints", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, message }),
      }).then(r => r.json());
      if (!r.ok) { showToast(r.error || (lang === "bn" ? "অভিযোগ জমা দেওয়া যায়নি" : "Could not submit complaint")); return; }
      setComplaintSubject(""); setComplaintMsg(""); setModal(null);
      showToast(lang === "bn" ? "✔ অভিযোগ জমা হয়েছে — সাপোর্ট শীঘ্রই যোগাযোগ করবে" : "✔ Complaint submitted — support will get back to you");
    } catch {
      showToast(lang === "bn" ? "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন" : "Network error — try again");
    } finally { setComplaintBusy(false); }
  };

  /* The Member Center grid — the 499bet set, minus "My Account" (its content is now
     the Profile tab itself, so a tile that opened a copy of the page made no sense). */
  const TILES: Array<{ key: string; icon: any; bn: string; en: string; soon?: boolean; onTap: () => void }> = [
    { key: "deposit", icon: Wallet, bn: "জমা\nদিন", en: "Deposit", onTap: () => goTab?.("deposit") },
    { key: "withdraw", icon: Banknote, bn: "উত্তোলন", en: "Withdraw", onTap: () => goTab?.("withdraw") },
    { key: "mycard", icon: CreditCard, bn: "আমার\nকার্ড", en: "My\nCard", onTap: () => setModal("mycard") },
    { key: "rewards", icon: Gift, bn: "আমার\nপুরস্কার", en: "My\nRewards", onTap: () => setPage("rewards") },
    { key: "bet_history", icon: ScrollText, bn: "বাজির\nইতিহাস", en: "Bet\nHistory", onTap: gotoLedger },
    { key: "pnl", icon: Scale, bn: "লাভ এবং\nলস", en: "Profit\n& Loss", onTap: () => setModal("pnl") },
    { key: "dep_rec", icon: ArrowDownToLine, bn: "জমা\nরেকর্ড", en: "Deposit\nRecord", onTap: () => { setRecordsType("DEPOSIT"); setModal("records"); } },
    { key: "wd_rec", icon: ArrowUpFromLine, bn: "উত্তোলন\nরেকর্ড", en: "Withdraw\nRecord", onTap: () => { setRecordsType("WITHDRAW"); setModal("records"); } },
    { key: "txn", icon: History, bn: "লেনদেনের\nইতিহাস", en: "Transaction\nHistory", onTap: () => { setRecordsType("ALL"); setModal("records"); } },
    { key: "security", icon: ShieldCheck, bn: "সুরক্ষা\nকেন্দ্র", en: "Security\nCenter", onTap: () => setModal("security") },
    { key: "invite", icon: Users, bn: "বন্ধুদের\nআমন্ত্রণ", en: "Invite\nFriends", onTap: () => setPage("invite") },
    { key: "mission", icon: Target, bn: "মিশন", en: "Mission", onTap: () => setPage("mission") },
    { key: "rebate", icon: Percent, bn: "রিবেট", en: "Rebate", onTap: () => setPage("rebate") },
    { key: "mail", icon: Mail, bn: "মেইল", en: "Mail", soon: true, onTap: comingSoon },
    { key: "advice", icon: MessageCircleQuestion, bn: "পরামর্শ", en: "Advice", onTap: () => goTab?.("promo") },
    { key: "app", icon: Smartphone, bn: "অ্যাপ\nডাউনলোড", en: "Download\nApp", onTap: appToast },
    { key: "cs", icon: Headset, bn: "কাস্টমার\nসার্ভিস", en: "Customer\nService", onTap: () => router.push("/member/support") },
    { key: "tg", icon: Send, bn: "টেলিগ্রাম\nএজেন্ট", en: "Telegram\nAgent", onTap: () => window.open("https://t.me/warstudiosite", "_blank", "noopener,noreferrer") },
    { key: "logout", icon: LogOut, bn: "লগআউট", en: "Log Out", onTap: () => setLogoutAsk(true) },
  ];


  /** 499bet-style icon grid. `compact` is the version that sits under the
   *  profile card on the account screen (4 across, round sand tiles). */
  const IconGrid = ({ compact = false }: { compact?: boolean }) => (
    <div className={compact ? "" : "rounded-2xl border border-white/8 bg-[#181818] px-2 pt-2 pb-2.5"}>
      {!compact && (
        <div className="flex items-center justify-between border-b border-white/8 pb-1.5">
          <h2 className="text-[10px] font-black tracking-[.25em] text-white/60 uppercase">{lang === "bn" ? "সদস্য সেন্টার" : "Member Center"}</h2>
          <button onClick={openComplaint} className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 active:scale-90" aria-label={lang === "bn" ? "সাপোর্ট" : "Support"}><Headset size={13} /></button>
        </div>
      )}
      <div className="flex justify-end -mb-1 pt-1">
        <button onClick={openComplaint} aria-label={lang === "bn" ? "অভিযোগ / সাপোর্ট" : "Complaint / support"}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#c9a227]/60 bg-[#c9a227]/15 text-[#a8892a] active:scale-90"><Headset size={13} /></button>
      </div>
      <div className={`grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-6 lg:grid-cols-9 ${compact ? "pt-1" : "mt-2"}`}>
        {TILES.map(({ key, icon: Icon, bn, en, soon, onTap }) => {
          // Every counter is a real, unclaimed-now quantity from /api/member/badges
          const badge = key === "rewards" ? Math.max(badges.rewards, badges.spin)
            : key === "mission" ? badges.missions
            : key === "rebate" ? badges.rebate
            : 0;
          return (
            <button key={key} onClick={onTap}
              className="flex flex-col items-center gap-1 rounded-xl px-0.5 py-1 transition-transform active:scale-90">
              <span className={`relative flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] ${
                compact
                  ? "border-[#e8dcc0] bg-[#f3ead6] text-[#c9a227]"
                  : "border-[#F5B800]/70 bg-[#F5B800]/8 text-[#F5B800] shadow-[0_0_12px_rgba(245,184,0,.18)]"}`}>
                <Icon size={19} strokeWidth={1.8} />
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-[1.5px] border-white bg-[#e23b3b] px-[3px] text-[8px] font-black leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={`whitespace-pre-line text-center text-[8.5px] font-bold leading-[1.15] ${compact ? "text-[#3c3428]" : "text-white/80"}`}>{lang === "bn" ? bn : en}</span>
              {soon && (
                <span className={`-mt-0.5 rounded-sm px-1 text-[6px] font-black tracking-wide ${compact ? "bg-[#c9a227]/15 text-[#a8892a]" : "bg-white/10 text-white/55"}`}>
                  {lang === "bn" ? "শীঘ্রই" : "SOON"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ── modal layer (shared by home + account screens) ── */
  const modalLayer = modal ? (

        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal onClick={() => setModal(null)}>
          <div className="w-full max-w-[480px] max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-[#F5B800]/25 bg-[#161616] p-3 pb-6" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/15" />
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-black uppercase tracking-widest text-[#F5B800]">
                {modal === "pnl" && (lang === "bn" ? "লাভ এবং লস" : "Profit & Loss")}
                {modal === "security" && (lang === "bn" ? "সুরক্ষা কেন্দ্র" : "Security Center")}
                {modal === "records" && (lang === "bn" ? "লেনদেনের রেকর্ড" : "Transaction Records")}
                {modal === "complaint" && (lang === "bn" ? "কাস্টমার সাপোর্ট — অভিযোগ" : "Customer Support — Complaint")}
                {modal === "mycard" && (lang === "bn" ? "আমার কার্ড" : "My Card")}
              </h3>
              <button onClick={() => setModal(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90" aria-label="Close"><X size={15} /></button>
            </div>

            {modal === "mycard" && (
              <div className="space-y-2.5">
                {/* the card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#faf7ee] via-[#f1ecdf] to-[#d9d2c0] p-3.5 text-[#1c1c1c] shadow-[0_14px_34px_rgba(0,0,0,.45)]">
                  <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full border-[14px] border-[#c9b98a]/40" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#141414] text-[#F5B800] shadow">
                      <UserRound size={26} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#b9b09a] bg-gradient-to-b from-[#efece1] to-[#c9c3b2] px-1.5 py-0.5 text-[9px] font-black text-[#4a463a]">
                          <ShieldCheck size={9} strokeWidth={2.6} />VIP{user.vip_level}
                        </span>
                        <span className="rounded bg-black/80 px-1.5 py-0.5 text-[7px] font-black tracking-widest text-[#F5B800]">100LUCK</span>
                      </div>
                      <p className="mt-1 truncate text-[15px] font-black leading-none tabular-nums">{user.phone ?? user.username_or_phone}</p>
                      <p className="mt-1 text-[8.5px] font-bold text-black/45 tabular-nums">
                        {lang === "bn" ? "আইডি" : "ID"} {idNo} · {lang === "bn" ? "যোগদান" : "Joined"} {joinDate}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white p-1 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/qr?d=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${user.referral_code ?? ""}`)}&s=180`} alt={lang === "bn" ? "আমার রেফারেল QR" : "My referral QR"} width={54} height={54} className="h-[54px] w-[54px]" />
                    </span>
                  </div>
                  <div className="relative mt-2.5 grid grid-cols-2 gap-2 border-t border-black/10 pt-2.5">
                    <div>
                      <p className="text-[7.5px] font-black uppercase tracking-widest text-black/40">{lang === "bn" ? "ব্যালেন্স" : "Balance"}</p>
                      <p className="text-[17px] font-black leading-none tabular-nums">৳{formatTaka(user.balance_cents, false)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[7.5px] font-black uppercase tracking-widest text-black/40">{lang === "bn" ? "রেফারেল কোড" : "Referral code"}</p>
                      <p className="text-[15px] font-black leading-none tracking-wider text-[#8a6500]">{user.referral_code ?? "—"}</p>
                    </div>
                  </div>
                </div>

                {/* copyable rows */}
                {[
                  { k: "phone", label: lang === "bn" ? "মোবাইল নম্বর" : "Phone number", value: user.phone ?? user.username_or_phone },
                  { k: "id", label: lang === "bn" ? "আইডি নম্বর" : "Player ID", value: idNo },
                  { k: "ref", label: lang === "bn" ? "রেফারেল কোড" : "Referral code", value: user.referral_code ?? "—" },
                ].filter(r => r.value && r.value !== "—").map(r => (
                  <button key={r.k} onClick={() => copyField(r.k, String(r.value))}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1E1E1E] px-2.5 py-2 text-left active:scale-[.99]">
                    <span className="min-w-0">
                      <span className="block text-[7.5px] font-black uppercase tracking-widest text-white/35">{r.label}</span>
                      <span className="block truncate text-[11.5px] font-black tabular-nums text-white/85">{r.value}</span>
                    </span>
                    {copiedField === r.k
                      ? <Check size={13} className="shrink-0 text-emerald-400" />
                      : <Copy size={12} className="shrink-0 text-white/35" />}
                  </button>
                ))}

                <button onClick={() => setShareOpen(true)}
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-[#ffd93b] to-[#f0b400] text-[12px] font-black text-[#241a00] shadow active:scale-[.98]">
                  <Share2 size={14} />{lang === "bn" ? "কার্ড শেয়ার করুন" : "Share my card"}
                </button>
                <p className="text-center text-[8px] text-white/30">
                  {lang === "bn" ? "এই কার্ডটি সাপোর্ট বা এজেন্টকে দেখান — আইডি ও নম্বরই যথেষ্ট" : "Show this card to support or an agent — the ID and number are enough"}
                </p>
              </div>
            )}


            {/* ── P&L modal ── */}
            {modal === "pnl" && (
              <div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl border border-red-400/25 bg-red-400/5 p-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/45">{lang === "bn" ? "মোট বাজি" : "Total bet"}</p>
                    <p className="mt-1 text-sm font-black text-red-400 tabular-nums">{formatTaka(wagered, false)}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/45">{lang === "bn" ? "মোট জয়" : "Total win"}</p>
                    <p className="mt-1 text-sm font-black text-emerald-400 tabular-nums">{formatTaka(won, false)}</p>
                  </div>
                  <div className={`rounded-2xl border p-3 ${net >= 0 ? "border-[#F5B800]/40 bg-[#F5B800]/8" : "border-white/12 bg-white/5"}`}>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/45">{lang === "bn" ? "নিট" : "Net"}</p>
                    <p className={`mt-1 text-sm font-black tabular-nums ${net >= 0 ? "text-[#F5B800]" : "text-red-400"}`}>{net >= 0 ? "+" : "-"}{formatTaka(Math.abs(net), false)}</p>
                  </div>
                </div>
                <p className="mt-2 text-center text-[8px] text-white/35">{lang === "bn" ? "শেষ ২৫টি গেম-লেনদেনের ভিত্তিতে · নিট জয়/লস" : "Based on your last 25 game transactions · net win/loss"}</p>
                <button onClick={gotoLedger} className="mt-2 h-10 w-full rounded-xl border border-[#F5B800]/40 bg-[#F5B800]/10 text-[11px] font-black text-[#F5B800] active:scale-[.98]">{lang === "bn" ? "বিস্তারিত হিস্টোরি দেখুন" : "View full history"}</button>
              </div>
            )}

            {/* ── Records modal (deposit / withdraw / all) ── */}
            {modal === "records" && (
              <div>
                <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                  {(["DEPOSIT", "WITHDRAW", "ALL"] as const).map(t => (
                    <button key={t} onClick={() => setRecordsType(t)}
                      className={`h-8 rounded-lg text-[10px] font-black transition-all ${recordsType === t ? "bg-[#F5B800] text-[#1a1300]" : "text-white/55"}`}>
                      {t === "DEPOSIT" ? (lang === "bn" ? "জমা" : "Deposit") : t === "WITHDRAW" ? (lang === "bn" ? "উত্তোলন" : "Withdraw") : (lang === "bn" ? "সব" : "All")}
                    </button>
                  ))}
                </div>
                {recordsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#F5B800]" size={22} /></div>
                ) : records.length === 0 ? (
                  <p className="py-6 text-center text-[10px] text-white/35">{lang === "bn" ? "কোনো রেকর্ড নেই" : "No records yet"}</p>
                ) : (
                  <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8">
                    {records.map(r => (
                      <div key={r.id} className="flex items-center gap-2 bg-[#1E1E1E] px-2.5 py-2">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${r.request_type === "DEPOSIT" ? "bg-emerald-400/10 text-emerald-400" : "bg-orange-400/10 text-orange-400"}`}>
                          {r.request_type === "DEPOSIT" ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold text-white/80">#{r.id} · {r.channel} <span className="text-white/35">· {r.trx_ref || r.account_ref || "—"}</span></p>
                          <p className="text-[7px] text-white/30 tabular-nums">{new Date(r.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-[10px] font-black text-white/85 tabular-nums">{formatTaka(r.amount_cents, false)}</p>
                          <StatusChip s={r.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Security modal: phone + change password ── */}
            {modal === "security" && (
              <div className="space-y-2.5">
                <form onSubmit={saveContact} className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/55 flex items-center gap-1"><Smartphone size={10} />{lang === "bn" ? "লগইন ফোন নম্বর" : "Login phone number"}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" className="h-9 min-w-0 flex-1 rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] placeholder:text-white/25 tabular-nums" aria-label={lang === "bn" ? "মোবাইল নম্বর" : "Mobile number"} required />
                    <button type="submit" disabled={contactBusy} className="h-9 shrink-0 rounded-lg border border-[#F5B800]/45 bg-[#F5B800]/10 px-3 text-[10px] font-black text-[#F5B800] disabled:opacity-60">{contactBusy ? "…" : (lang === "bn" ? "সেভ" : "Save")}</button>
                  </div>
                </form>

                <form onSubmit={changePassword} className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/55 flex items-center gap-1"><KeyRound size={10} />{lang === "bn" ? "পাসওয়ার্ড পরিবর্তন" : "Change password"}</p>
                  <input value={pwCur} onChange={e => setPwCur(e.target.value)} type="password" placeholder={lang === "bn" ? "বর্তমান পাসওয়ার্ড" : "Current password"} className="mt-1.5 h-9 w-full rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] placeholder:text-white/25" autoComplete="current-password" required />
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <input value={pwNew} onChange={e => setPwNew(e.target.value)} type="password" placeholder={lang === "bn" ? "নতুন পাসওয়ার্ড" : "New password"} className="h-9 min-w-0 rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] placeholder:text-white/25" autoComplete="new-password" minLength={6} required />
                    <input value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} type="password" placeholder={lang === "bn" ? "নতুন আবার" : "Confirm new"} className="h-9 min-w-0 rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] placeholder:text-white/25" autoComplete="new-password" minLength={6} required />
                  </div>
                  <button type="submit" disabled={pwBusy} className="mt-1.5 h-9 w-full rounded-lg bg-[#F5B800] text-[10px] font-black text-[#1a1300] disabled:opacity-60">{pwBusy ? "…" : (lang === "bn" ? "পাসওয়ার্ড পরিবর্তন করুন" : "Change password")}</button>
                </form>
                <p className="px-1 text-[8px] leading-snug text-white/35">{lang === "bn" ? "🔒 আপনার পাসওয়ার্ড কখনো কাউকে বলবেন না। ১০০ লাক কখনো ফোন বা মেসেজে পাসওয়ার্ড চায় না।" : "🔒 Never share your password. 100LUCK will never ask for it over phone or message."}</p>
              </div>
            )}

            {/* ── Complaint modal: contact customer service ── */}
            {modal === "complaint" && (
              <div className="space-y-2.5">
                <p className="px-1 text-[9px] leading-snug text-white/45">{lang === "bn" ? "আপনার সমস্যা বা অভিযোগ লিখে পাঠান — সাপোর্ট টিম আপনার অ্যাকাউন্ট ও লেনদেন দেখে দ্রুত সমাধান করবে।" : "Describe your issue — the support team will review your account and transactions and get back to you."}</p>
                <input value={complaintSubject} onChange={e => setComplaintSubject(e.target.value)} placeholder={lang === "bn" ? "বিষয় (যেমন: ডিপোজিট আসেনি)" : "Subject (e.g. Deposit not credited)"} maxLength={80} className="h-10 w-full rounded-lg border border-white/12 bg-[#141414] px-2.5 text-[11px] placeholder:text-white/25" aria-label={lang === "bn" ? "বিষয়" : "Subject"} />
                <textarea value={complaintMsg} onChange={e => setComplaintMsg(e.target.value)} placeholder={lang === "bn" ? "বিস্তারিত লিখুন — লেনদেন আইডি, ট্রানজেকশন আইডি, তারিখ ইত্যাদি থাকলে দ্রুত সমাধান হবে (কমপক্ষে ১০ অক্ষর)" : "Describe in detail — include transaction/TrxID and date if possible (min 10 chars)"} rows={4} maxLength={2000} className="w-full rounded-lg border border-white/12 bg-[#141414] p-2.5 text-[11px] placeholder:text-white/25 resize-none" aria-label={lang === "bn" ? "বার্তা" : "Message"} />
                <button onClick={submitComplaint} disabled={complaintBusy} className="h-10 w-full rounded-lg bg-[#F5B800] text-[11px] font-black text-[#1a1300] disabled:opacity-60 active:scale-[.98]">{complaintBusy ? "…" : (lang === "bn" ? "অভিযোগ জমা দিন" : "Submit complaint")}</button>
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2 text-center text-[8.5px] text-emerald-300/90">
                  <p className="font-black uppercase tracking-widest text-emerald-200/80">{lang === "bn" ? "২৪/৭ সাপোর্ট লাইন" : "24/7 support line"}</p>
                  <p className="mt-0.5 tabular-nums">Telegram: @warstudiosite</p>
                </div>
              </div>
            )}
          </div>
        </div>
  ) : null;

  /* ── logout confirmation — 499bet asks before ending the session ── */
  const logoutLayer = logoutAsk ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-8 backdrop-blur-sm" role="dialog" aria-modal
      onClick={() => setLogoutAsk(false)}>
      <div className="w-full max-w-[300px] rounded-2xl border border-white/12 bg-[#1b1b1b] p-4 text-center" onClick={e => e.stopPropagation()}>
        <LogOut size={26} className="mx-auto text-red-400" />
        <p className="mt-2 text-[13px] font-black text-white">{lang === "bn" ? "লগআউট করবেন?" : "Log out?"}</p>
        <p className="mt-1 text-[9.5px] leading-snug text-white/45">
          {lang === "bn" ? "আপনার ব্যালেন্স ও অগ্রগতি সুরক্ষিত থাকবে — আবার লগইন করলেই ফিরে পাবেন।" : "Your balance and progress stay safe — just log back in."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setLogoutAsk(false)}
            className="h-10 rounded-xl border border-white/12 bg-white/5 text-[11px] font-black text-white/70 active:scale-[.98]">
            {lang === "bn" ? "থাকব" : "Stay"}
          </button>
          <button onClick={() => { setLogoutAsk(false); onLogout(); }}
            className="h-10 rounded-xl bg-gradient-to-b from-[#f05e5e] to-[#d63b3b] text-[11px] font-black text-white active:scale-[.98]">
            {lang === "bn" ? "লগআউট" : "Log out"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ═══════════════ PROFILE TAB (the old "My Account" screen, now the tab itself) ═══════════════ */
  const profileTab = (
      <div className="mx-auto w-full max-w-[520px] px-3 pt-3 pb-4 lg:max-w-[1000px]">

        {/* Light cream card — 499bet-style profile card */}
        <div className="relative overflow-hidden rounded-3xl border border-black/20 bg-gradient-to-br from-[#faf7ee] via-[#f0ecdf] to-[#ddd6c6] p-4 text-[#1c1c1c] shadow-[0_18px_40px_rgba(0,0,0,.45)]">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-[#c9b98a]/40" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-[#3a3a3a] to-[#141414] shadow">
              <UserRound size={44} className="text-[#e8e4d6]" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#b9b09a] bg-gradient-to-b from-[#efece1] to-[#c9c3b2] px-2 py-0.5 text-[10px] font-black text-[#4a463a] shadow-sm"><ShieldCheck size={10} strokeWidth={2.5} />VIP{user.vip_level}</span>
              <button onClick={copyPhone} className="mt-1 flex items-center gap-1.5 text-left" aria-label={lang === "bn" ? "আইডি / ফোন নম্বর কপি করুন" : "Copy ID / phone number"}>
                <span className="text-[19px] font-black leading-none tabular-nums tracking-tight">{user.phone ?? user.username_or_phone}</span>
                {copiedPhone ? <Check size={13} className="text-emerald-700" /> : <Copy size={12} className="text-black/40" />}
              </button>
              <p className="mt-1 text-[10px] font-semibold text-black/55">{lang === "bn" ? "যোগদান করেছেন" : "Joined"}: {joinDate}</p>
              <p className="text-[8px] font-bold text-black/35 tabular-nums">{lang === "bn" ? "আইডি" : "ID"} {idNo} · {user.currency}</p>
            </div>
          </div>

          <div className="relative mt-4 flex items-end justify-between gap-2 border-t border-black/10 pt-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-black/45">{lang === "bn" ? "ব্যালেন্স" : "Balance"}</p>
              <p className="text-[34px] font-black leading-none tabular-nums tracking-tight">৳ {formatTaka(user.balance_cents, false)}</p>
            </div>
            <button onClick={async () => { setRefreshing(true); await refreshUser(); setRefreshing(false); }} disabled={refreshing} aria-label={lang === "bn" ? "ব্যালেন্স রিফ্রেশ করুন" : "Refresh balance"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-black/45 transition hover:bg-black/5 active:scale-90">
              <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="relative mt-3 grid grid-cols-3 gap-2">
            <button onClick={() => goTab?.("deposit")} className="h-11 rounded-full bg-gradient-to-b from-[#ffd93b] to-[#f0b400] text-[12px] font-black text-[#241a00] shadow active:scale-[.97]">{lang === "bn" ? "জমা দিন" : "Deposit"}</button>
            <button onClick={() => goTab?.("withdraw")} className="h-11 rounded-full bg-gradient-to-b from-[#3a3a3a] to-[#191919] text-[12px] font-black text-[#f5f0e2] shadow active:scale-[.97]">{lang === "bn" ? "উত্তোলন" : "Withdraw"}</button>
            <button onClick={() => setModal("mycard")} className="flex h-11 items-center justify-center gap-1 rounded-full border border-black/15 bg-[#e6e0d0] text-[12px] font-black text-[#2b2b26] shadow-sm active:scale-[.97]">
              <QrCode size={13} strokeWidth={2.6} />{lang === "bn" ? "আমার কার্ড" : "My Card"}
            </button>
          </div>
        </div>

        {/* MEMBER CENTER GRID — directly under the profile card (499bet order) */}
        <div className="mt-3 rounded-2xl border border-[#e8dcc0] bg-[#faf7ee] px-2 pt-2 pb-3 lg:px-3">
          <span className="inline-block rounded-full border border-black/10 bg-white/70 px-2 py-0.5 text-[9px] font-black tracking-wide text-[#4a463a]">
            {lang === "bn" ? "সদস্য সেন্টার" : "Member Center"}
          </span>
          <IconGrid compact />
        </div>

        {/* game launch profile — the provider needs a phone number, this is where it is set */}
        {contactMissing && (
          <form onSubmit={saveContact} className="mt-3 rounded-2xl border border-[#F5B800]/50 bg-[#F5B800]/5 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#F5B800]"><BadgeCheck size={11} />{lang === "bn" ? "গেম চালু করার প্রোফাইল" : "Game launch profile"}</p>
              <span className="rounded bg-[#F5B800] px-1.5 py-0.5 text-[7.5px] font-black text-[#1a1300]">{lang === "bn" ? "লাগবে" : "required"}</span>
            </div>
            <p className="mt-0.5 text-[7.5px] text-white/40">{lang === "bn" ? "শুধু ১১ ডিজিটের নম্বর দিন (01XXXXXXXXX) — কান্ট্রি কোড লাগবে না, আমরা নিজেই +৮৮০ যোগ করি।" : "Just your 11-digit number (01XXXXXXXXX) — no country code needed, we add +880 for you."}</p>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" className="mt-1.5 h-9 w-full rounded-xl border border-white/12 bg-black/40 px-2.5 text-[11px] tabular-nums placeholder:text-white/25" aria-label={lang === "bn" ? "মোবাইল নম্বর" : "Mobile number"} required />
            <button type="submit" disabled={contactBusy} className="mt-1.5 h-9 w-full rounded-xl border border-[#F5B800]/45 bg-[#F5B800]/10 text-[10px] font-black text-[#F5B800] disabled:opacity-60">{contactBusy ? "…" : (lang === "bn" ? "সেভ করুন" : "Save phone number")}</button>
          </form>
        )}

        {/* ledger history */}
        <div ref={ledgerRef} className="mt-3 scroll-mt-16">
          <button onClick={() => setShowLedger(v => !v)} className="flex w-full items-center justify-between py-1">
            <h2 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60"><History size={11} />{lang === "bn" ? "লেজার হিস্টোরি (শেষ ২৫)" : "Ledger history (last 25)"}</h2>
            {showLedger ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
          </button>
          {showLedger && (
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8">
              {ledger.length === 0 && <p className="bg-[#1E1E1E] py-5 text-center text-[10px] text-white/30">{lang === "bn" ? "এখনো কোনো লেনদেন নেই" : "No transactions yet"}</p>}
              {ledger.map(e => (
                <div key={e.id} className="flex items-center gap-2 bg-[#1E1E1E] px-2.5 py-2">
                  <span className="shrink-0">{actionIcon(e.action_type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold leading-tight text-white/80">{e.tx_subtype} <span className="font-medium text-white/30">· {e.provider_code}{e.game_code ? `/${e.game_code}` : ""}</span></p>
                    <p className="text-[7.5px] tabular-nums text-white/30">{new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-[10px] font-black tabular-nums ${e.action_type === "DEBIT" || e.action_type === "WITHDRAW" ? "text-red-400" : "text-emerald-400"}`}>{signOf(e.action_type)}{formatTaka(e.amount_cents, false)}</p>
                    <p className="text-[7px] tabular-nums text-white/30">{lang === "bn" ? "ব্যাল" : "bal"} {formatTaka(e.balance_after_cents, false)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[8px] tracking-widest text-white/25">100LUCK · 18+ · {lang === "bn" ? "মুদ্রা বিডিটি (৳)" : "Currency BDT (৳)"}</p>
        {modalLayer}
        {logoutLayer}
        {shareOpen && <ReferralShareModal code={user.referral_code} onClose={() => setShareOpen(false)} showToast={showToast} />}
      </div>
  );

  /* ═══════════════ PROFILE TAB ═══════════════ */
  return profileTab;
}
