"use client";
import { useState } from "react";
import { Coins, Users, CheckCircle2, Info, Megaphone, Handshake } from "lucide-react";
import { useLang } from "../lang";
import { openTelegram } from "@/lib/telegram";
import { useRules } from "@/lib/useRules";
import { takaRound } from "@/lib/rules";
import InviteView from "./InviteView";

const PROMOS = [
  { icon: Users, tagEn: "REFER", tagBn: "রেফার", accent: "#4ade80",
    titleEn: "", titleBn: "", priceKey: "refer",
    bodyEn: "", bodyBn: "",
    rulesEn: "Once per referred friend · credited automatically as bonus balance", rulesBn: "প্রতি রেফারে একবার · বোনাস ব্যালেন্সে অটো ক্রেডিট" },
  { icon: Coins, tagEn: "ACTIVE", tagBn: "সক্রিয়", accent: "#ff6b4a",
    titleEn: "10% Weekly Cashback", titleBn: "১০% সাপ্তাহিক ক্যাশব্যাক",
    bodyEn: "10% back on all slot losses every Friday — unlimited, no cap.", bodyBn: "প্রতি শুক্রবার স্লটে নিট লসের ১০% ফেরত — আনলিমিটেড, কোনো ক্যাপ নেই।",
    rulesEn: "Credited Monday · min loss ৳1,000 · 5x wagering", rulesBn: "সোমবার ক্রেডিট হয় · ন্যূনতম লস ৳১,০০০ · ৫x টার্নওভার" },
];

export default function PromoView({ showToast, user, refreshUser }: {
  showToast: (m: string) => void;
  user: any | null;
  onAuthClick: () => void;
  refreshUser: () => Promise<any>;
}) {
  const { lang } = useLang();
  const rules = useRules();

  const card = (p: (typeof PROMOS)[number]) => {
    if (p.priceKey === "refer") {
      const amt = takaRound(rules.referral_bonus_cents);
      const dep = takaRound(rules.referral_deposit_min_cents), wag = takaRound(rules.referral_wager_min_cents);
      return {
        title: lang === "bn" ? `রেফার করুন ${amt} নিন` : `Refer & Earn ${amt}`,
        body:  lang === "bn"
          ? `বন্ধুকে রেফার করুন — সে ${dep} ডিপোজিট ও ${wag} খেলার শর্ত পূরণ করলে আপনি ${amt} পাবেন।`
          : `Refer a friend — you get ${amt} once they deposit ${dep} and wager ${wag}.`,
        rules: lang === "bn" ? "প্রতি রেফারে একবার · বোনাস ব্যালেন্সে অটো ক্রেডিট" : "Once per referred friend · credited automatically as bonus balance",
      };
    }
    return { title: lang === "bn" ? p.titleBn : p.titleEn, body: lang === "bn" ? p.bodyBn : p.bodyEn, rules: lang === "bn" ? p.rulesBn : p.rulesEn };
  };
  // Invite is a nested promo page. Prize surfaces are temporarily hidden.
  const [page, setPage] = useState<"invite" | null>(null);

  // Full-screen sub-page: replace the promo list rather than stacking below it.
  if (page === "invite") {
    return <InviteView showToast={showToast} onBack={() => setPage(null)} referralCode={String(user?.referral_code ?? "")} />;
  }

  return (
    <div className="px-3 pt-3 pb-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5B800]/10 border border-[#F5B800]/30"><Megaphone size={18} className="text-[#F5B800]" /></span>
        <div>
          <h1 className="text-sm font-black text-white leading-none">{lang === "bn" ? "প্রমোশন ও বোনাস" : "Promotions & Bonus"}</h1>
          <p className="text-[9px] text-white/40 mt-0.5">{lang === "bn" ? "রেফারেল ও প্রমোশন" : "Referral and promotions"}</p>
        </div>
      </div>



      {PROMOS.map(p => {
        const Icon = p.icon;
        return (
          <div key={p.tagEn} className="card-metal rounded-2xl p-3 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10" style={{ background: p.accent }} />
            <div className="flex items-start gap-2.5 relative">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40"><Icon size={21} style={{ color: p.accent }} strokeWidth={1.9} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-emerald-400/15 border border-emerald-400/40 px-1 py-0.5 text-[7px] font-black text-emerald-400 tracking-widest">{lang === "bn" ? p.tagBn : p.tagEn}</span>
                </div>
                <p className="text-[12px] font-black text-white mt-0.5">{card(p).title}</p>
                <p className="text-[9.5px] text-white/60 leading-snug mt-0.5">{card(p).body}</p>
                <p className="flex items-start gap-1 text-[8px] text-[#F5B800]/75 mt-1"><Info size={9} className="mt-0.5 shrink-0" />{card(p).rules}</p>
                {p.tagEn === "REFER" ? (
                  <button onClick={() => setPage("invite")}
                    className="mt-2 h-9 px-4 rounded-xl bg-emerald-400 text-[10.5px] font-black text-black tracking-widest active:scale-[.98]">
                    {lang === "bn" ? "আমন্ত্রণ জানান" : "Invite friends"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      {/* Referral how-to */}
      <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-3">
        <p className="text-[10px] font-black tracking-widest text-emerald-400 uppercase flex items-center gap-1.5"><Users size={11} />{lang === "bn" ? "রেফারেল বোনাস কীভাবে পাবেন" : "How referral bonus works"}</p>
        <ul className="mt-1.5 space-y-1 text-[9.5px] text-white/60">
          {(lang === "bn" ? [
            "মেম্বার ট্যাব → শেয়ার — আপনার রেফারেল লিংক ও QR বন্ধুকে পাঠান",
            "বন্ধু লিংকে ট্যাপ/QR স্ক্যান করে সরাসরি রেজিস্টার করবে (কোড লেখার দরকার নেই)",
            "বন্ধু সাইন আপ করে খেলতে শুরু করলেই আপনি পাবেন ৳৩০০ — অটো ক্রেডিট",
          ] : [
            "Member tab → Share — send your referral link or QR to a friend",
            "Your friend registers straight from the link or QR (no code to type)",
            "Once your friend signs up and starts playing, you are credited ৳300 — automatically",
          ]).map((rule, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 size={10} className="text-emerald-400/80 mt-0.5 shrink-0" />{rule}</li>)}
        </ul>
      </div>

      {/* Cashback rules */}
      <div className="rounded-2xl border border-[#F5B800]/30 bg-gradient-to-br from-[#F5B800]/10 to-transparent p-3">
        <p className="text-[10px] font-black tracking-widest text-[#F5B800] uppercase flex items-center gap-1.5"><Coins size={11} />{lang === "bn" ? "ক্যাশব্যাক নিয়মাবলী" : "Cashback rules"}</p>
        <ul className="mt-1.5 space-y-1 text-[9.5px] text-white/60">
          {(lang === "bn" ? [
            "শুধুমাত্র স্লট ক্যাটাগরির বাজি ক্যাশব্যাকে গণনা হয়",
            "নেট লস = মোট বাজি − মোট জয়; ১০% রিটার্ন",
            "বোনাস হিসেবে ক্রেডিট হয়, ৫x টার্নওভার প্রযোজ্য",
            "সর্বোচ্চ ক্যাশব্যাক ৳৫০,০০০ প্রতি সপ্তাহে",
          ] : [
            "Only SLOTS-category bets qualify for cashback",
            "Net loss = total bets − total wins; 10% returned",
            "Credited as bonus funds, 5x wagering applies",
            "Maximum cashback ৳50,000 per week",
          ]).map((rule, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 size={10} className="text-[#F5B800]/70 mt-0.5 shrink-0" />{rule}</li>)}
        </ul>
      </div>

      {/* Agent / affiliate */}
      <div className="rounded-2xl border border-purple-400/30 bg-gradient-to-br from-purple-500/10 to-transparent p-3">
        <p className="text-[10px] font-black tracking-widest text-purple-300 uppercase flex items-center gap-1.5"><Handshake size={11} />{lang === "bn" ? "এজেন্ট / অ্যাফিলিয়েট প্রোগ্রাম" : "Agent / Affiliate program"}</p>
        <p className="mt-1.5 text-[9.5px] text-white/60 leading-snug">{lang === "bn"
          ? "সাব-এজেন্ট কমিশন হায়ারার্কি: সিটি এজেন্ট ৩০% · ডিস্ট্রিক্ট ৪০% · মাস্টার ৫০%। সাপ্তাহিক সেটেলমেন্ট বিকাশে।"
          : "Sub-agent commission ladder: City 30% · District 40% · Master 50%. Weekly settlement via bKash."}</p>
        <button onClick={() => (showToast(lang === "bn" ? "🤝 Telegram করুন @warstudiosite — NID ও bKash নম্বর সাথে রাখুন" : "🤝 Telegram @warstudiosite — keep your NID and bKash number ready"), openTelegram())}
          className="mt-2 h-9 w-full rounded-xl border border-purple-400/50 bg-purple-500/15 text-[10px] font-black text-purple-300 active:scale-[.98]">
          {lang === "bn" ? "এজেন্ট আবেদন করুন" : "Apply to become an agent"}
        </button>
      </div>

    </div>
  );
}
