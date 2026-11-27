"use client";
/**
 * সাপোর্ট — the support section (v52).
 *
 * One screen that answers "how do I reach a human":
 *   • the ticket chat our admins answer in /api/chat (the SaleSmartly vendor widget
 *     was removed from the codebase in v53 — no third-party script is loaded);
 *   • what to have ready before writing (deposit trx id, bound bKash number);
 *   • honest response windows, and the in-site ticket options that always work:
 *     the ticket chat the admin answers in /api/chat, and complaints.
 *
 * House rules it respects: bKash / Nagad / Upay only (no other rails are ever
 * named), and payouts are manual, so the copy tells players the real timing
 * instead of promising an instant automated transfer.
 */
import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/components/lang";
import { ChevronLeft, Headset, MessageSquare, Clock, ShieldCheck, AlertTriangle, Send } from "lucide-react";
import SupportChat from "../SupportChat";
import { TG_HANDLE, TG_URL } from "@/lib/telegram";
import type { SessionUser } from "@/lib/types";

export default function SupportView({ user, onAuthClick }: { user: SessionUser | null; onAuthClick: () => void }) {
  const { lang } = useLang();
  const T = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const [ticketOpen, setTicketOpen] = useState(false);
  const liveHidden = true;   // no third-party live chat any more
  const statusText = T("An admin answers tickets, usually within 1 hour",
                       "অ্যাডমিন টিকিটে উত্তর দেন, সাধারণত ১ ঘণ্টার মধ্যে");

  const CARDS = [
    {
      icon: MessageSquare, accent: "#4ade80",
      bn: "সাপোর্ট টিকিট", en: "Support ticket",
      bodyBn: "এখানেই লিখুন — অ্যাডমিন প্যানেল থেকে সরাসরি উত্তর পাবেন, ছবি পাঠাতে পারবেন।",
      bodyEn: "Message us here — an admin answers from the panel, and you can attach a screenshot.",
      ctaBn: "টিকিট খুলুন", ctaEn: "Open ticket",
      onTap: () => (user ? setTicketOpen(true) : onAuthClick()),
    },
    {
      icon: AlertTriangle, accent: "#F5B800",
      bn: "অভিযোগ জানান", en: "File a complaint",
      bodyBn: "পেমেন্ট বা অ্যাকাউন্ট সমস্যার লিখিত অভিযোগ — টিকিট নম্বরসহ ট্র্যাক করা যায়।",
      bodyEn: "A written complaint for a payment or account issue, tracked with a reference number.",
      ctaBn: "অভিযোগ করুন", ctaEn: "Complain",
      href: "/member",
    },
  ];

  const PREP_BN = [
    "ডিপোজিট/উইথড্রয়ের সময়, অ্যামাউন্ট ও ট্রানজেকশন আইডি (TrxID)",
    "যে bKash / Nagad / Upay নম্বর থেকে বা যেটিতে টাকা পাঠানো হয়েছে",
    "সমস্যার স্ক্রিনশট (টিকিটে সরাসরি ছবি পাঠানো যায়)",
  ];
  const PREP_EN = [
    "The time, amount and transaction id (TrxID) of the deposit or withdrawal",
    "The bKash / Nagad / Upay number the money was sent from or to",
    "A screenshot of the problem (pictures can be attached to a ticket)",
  ];

  return (
    <div className="px-3 pb-6 pt-2">
      <div className="flex items-center gap-2">
        <Link href="/member" prefetch aria-label={T("Back", "পেছনে")}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[.04] text-white/70 active:scale-90">
          <ChevronLeft size={17} />
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-400/10 text-emerald-300"><Headset size={18} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[14px] font-black leading-none text-white">{T("Support", "সাপোর্ট")}</h1>
          <p className="mt-0.5 text-[9px] text-white/40">
            {liveHidden
              ? T("Tickets and complaints", "টিকিট ও অভিযোগ")
              : T("Live chat, tickets and complaints", "লাইভ চ্যাট, টিকিট ও অভিযোগ")}
          </p>
        </div>
      </div>

      {/* Telegram agent — opens the Telegram app, web fallback */}
      <a href={TG_URL} target="_blank" rel="noopener noreferrer"
        className="card-metal mt-3 flex items-center gap-2.5 rounded-2xl border-sky-400/35 p-3 active:scale-[.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-sky-400 to-sky-600 text-black"><Send size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-black text-white">{T("Telegram agent", "টেলিগ্রাম এজেন্ট")}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{TG_HANDLE}
          </span>
          <span className="mt-1 block text-[9px] leading-snug text-white/50">
            {T("Chat with a real agent in Bangla or English — opens in your Telegram app.",
               "বাংলা বা ইংরেজিতে এজেন্টের সাথে কথা বলুন — আপনার টেলিগ্রাম অ্যাপে খুলবে।")}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-gradient-to-b from-sky-400 to-sky-600 px-2.5 py-1.5 text-[9px] font-black text-black">{T("Open", "খুলুন")}</span>
      </a>

      {/* live chat — the plugin, with its real state */}
      <div className="card-metal mt-3 overflow-hidden rounded-2xl border-emerald-400/35 p-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-black"><MessageSquare size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-black text-white">
              {liveHidden ? T("Support ticket — 24/7", "সাপোর্ট টিকিট — ২৪/৭") : T("24/7 live chat", "২৪/৭ লাইভ চ্যাট")}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {statusText}
            </p>
            <p className="mt-1 text-[9px] leading-snug text-white/50">
              {liveHidden
                ? T("Write to us here — an admin answers from the panel in Bangla or English, usually within 1 hour.",
                    "এখানেই লিখুন — অ্যাডমিন প্যানেল থেকে বাংলা বা ইংরেজিতে উত্তর দেন, সাধারণত ১ ঘণ্টার মধ্যে।")
                : T("Deposit, withdrawal and bonus questions are answered by a real agent in Bangla or English.",
                    "ডিপোজিট, উইথড্র ও বোনাস সংক্রান্ত প্রশ্নের উত্তর দেন একজন এজেন্ট — বাংলা বা ইংরেজিতে।")}
            </p>
          </div>
        </div>
        <button onClick={() => (user ? setTicketOpen(true) : onAuthClick())}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-[12.5px] font-black text-black active:scale-[.99] disabled:opacity-60">
          <Headset size={15} />
          {T("Write to support", "সাপোর্টে লিখুন")}
        </button>
      </div>

      {/* other entries */}
      <div className="mt-2 grid gap-2">
        {CARDS.map(c => {
          const Icon = c.icon;
          const inner = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40" style={{ color: c.accent }}><Icon size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-black text-white">{T(c.en, c.bn)}</span>
                <span className="mt-0.5 block text-[9px] leading-snug text-white/50">{T(c.bodyEn, c.bodyBn)}</span>
              </span>
              <span className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[8.5px] font-black text-white/70">{T(c.ctaEn, c.ctaBn)}</span>
            </>
          );
          return c.href ? (
            <Link key={c.en} href={c.href} prefetch className="card-metal flex items-center gap-2.5 rounded-2xl p-2.5 active:scale-[.99]">{inner}</Link>
          ) : (
            <button key={c.en} onClick={c.onTap} className="card-metal flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left active:scale-[.99]">{inner}</button>
          );
        })}
      </div>

      {/* what to have ready */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/60">
          <ShieldCheck size={11} className="text-emerald-400" />{T("Before you write", "লেখার আগে সাথে রাখুন")}
        </p>
        <ul className="mt-1.5 space-y-1 text-[9px] leading-snug text-white/55">
          {(lang === "bn" ? PREP_BN : PREP_EN).map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-400">•</span>{r}</li>)}
        </ul>
        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[.07] px-2 py-1.5 text-[8.5px] leading-snug text-amber-200/90">
          {T("We never ask for your password or your withdrawal PIN. Withdrawals are paid by hand to bKash, Nagad or Upay — normally within 30 minutes of approval.",
             "আমরা কখনোই আপনার পাসওয়ার্ড বা উইথড্রয়াল পিন চাই না। উইথড্র ম্যানুয়ালি bKash, Nagad বা Upay-তে পাঠানো হয় — অনুমোদনের পর সাধারণত ৩০ মিনিটের মধ্যে।")}
        </p>
      </div>

      {/* hours + scope */}
      <div className="mt-2 rounded-2xl border border-white/10 bg-white/[.03] p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/60">
          <Clock size={11} className="text-[#F5B800]" />{T("Response times", "উত্তরের সময়")}
        </p>
        <div className="mt-1.5 space-y-1 text-[9px] text-white/55">
          {(liveHidden
            ? [
                [T("Telegram agent", "টেলিগ্রাম এজেন্ট"), T("fastest — usually minutes", "সবচেয়ে দ্রুত — সাধারণত কয়েক মিনিটে")],
                [T("Support ticket", "সাপোর্ট টিকিট"), T("within 1 hour", "১ ঘণ্টার মধ্যে")],
                [T("Deposit / withdrawal issue", "ডিপোজিট / উইথড্র সমস্যা"), T("within 30 minutes after approval", "অনুমোদনের পর ৩০ মিনিটে")],
                [T("Complaint", "অভিযোগ"), T("reference number, tracked", "রেফারেন্স নম্বরসহ ট্র্যাক করা")],
              ]
            : [
                [T("Live chat", "লাইভ চ্যাট"), T("usually within minutes", "সাধারণত কয়েক মিনিটে")],
                [T("Support ticket", "সাপোর্ট টিকিট"), T("within 1 hour", "১ ঘণ্টার মধ্যে")],
                [T("Deposit / withdrawal issue", "ডিপোজিট / উইথড্র সমস্যা"), T("within 30 minutes after approval", "অনুমোদনের পর ৩০ মিনিটে")],
              ]
          ).map(([k, v]) => (
            <div key={String(k)} className="flex items-center justify-between border-b border-white/5 pb-1 last:border-0 last:pb-0">
              <span>{k}</span><span className="font-black text-white/75">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {ticketOpen && <SupportChat onClose={() => setTicketOpen(false)} onAuthClick={() => { setTicketOpen(false); onAuthClick(); }} />}
    </div>
  );
}
