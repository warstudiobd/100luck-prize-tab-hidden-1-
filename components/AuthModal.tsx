"use client";
import { useEffect, useState } from "react";
import { X, Phone, Lock, Eye, EyeOff, ShieldCheck, Loader2, Gift, CheckCircle2, Check } from "lucide-react";
import { useLang } from "./lang";
import { normaliseBdPhone } from "@/lib/phone";

export default function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (msg: string) => void }) {
  const { t, lang } = useLang();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneTaken, setPhoneTaken] = useState(false);
  /* v55 "remember me": ticked by default, because a player who has to retype a
     number and a password on every visit simply stops coming back. The value
     rides on the request, and the server decides the real session lifetime. */
  const [remember, setRemember] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    /* the identity only — never the password, never the token */
    const m = document.cookie.match(/(?:^|;\s*)sonali7_last_user=([^;]+)/);
    const last = m ? decodeURIComponent(m[1]) : "";
    if (last) { setPhone(last); setPrefilled(true); }
  }, []);
  // Referral travels by LINK only (?ref=CODE): we read it from the URL, show who
  // invited the player, and never ask them to type a code.
  const [refFromLink, setRefFromLink] = useState<string | null>(null);
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    const clean = (r ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    setRefFromLink(clean || null);
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const id = phone.trim();
    const localPhone = normaliseBdPhone(id);
    if (mode === "register" && !localPhone) {
      setError(lang === "bn" ? "সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)" : "Enter a valid BD mobile number (01XXXXXXXXX)");
      return;
    }
    if (mode === "register") {
      if (password !== confirmPassword) {
        setError(lang === "bn" ? "পাসওয়ার্ড মিলছে না" : "Passwords do not match");
        return;
      }
    }
    setBusy(true); setError(null); setPhoneTaken(false);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "register"
          ? { username_or_phone: localPhone ?? id, password, confirm_password: confirmPassword, referral_code: refFromLink ?? undefined, remember: true }
          : { username_or_phone: id, password, remember }),
      }).then(r => r.json());
      if (!r.ok) {
        setPhoneTaken(r.code === "phone_taken");
        setError((lang === "bn" ? r.error_bn || r.error : r.error) || (lang === "bn" ? "অনুরোধ ব্যর্থ হয়েছে" : "Request failed"));
        return;
      }
      onSuccess(mode === "login" ? (lang === "bn" ? "স্বাগতম! সফলভাবে লগইন হয়েছে" : "Welcome back! Logged in successfully") : (lang === "bn" ? "অ্যাকাউন্ট তৈরি হয়েছে — স্বাগতম!" : "Account created — welcome!"));
    } catch {
      setError(lang === "bn" ? "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন" : "Network error — please try again");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal>
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="sheet-up relative w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl border border-[#F5B800]/30 bg-gradient-to-b from-[#232323] to-[#161616] p-5 pb-7 shadow-gold">
        <button onClick={onClose} className="absolute right-4 top-4 p-1.5 rounded-full text-white/60 hover:bg-white/5 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={20} className="text-[#F5B800]" />
          <h2 className="gold-text text-xl font-black">{mode === "login" ? t("login") : t("register")}</h2>
        </div>
        <p className="text-[10px] text-white/45 mb-4">{lang === "bn" ? "100LUCK · ১০০% নিরাপদ SSL · বিকাশ/নগদ ভেরিফায়েড এজেন্ট" : "100LUCK · 100% secure SSL · bKash/Nagad verified agent"}</p>

        {/* Mode switch */}
        <div className="grid grid-cols-2 rounded-xl bg-black/40 p-1 border border-white/10 mb-4">
          {(["login", "register"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); setPhoneTaken(false); }}
              className={`h-9 rounded-lg text-xs font-bold transition-all ${mode === m ? "bg-gradient-to-b from-[#ffe066] to-[#F5B800] text-[#1a1300]" : "text-white/60"}`}>
              {m === "login" ? t("login") : t("register")}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="flex items-center justify-between text-[10px] font-semibold text-white/55 mb-1">
              <span>{lang === "bn" ? "মোবাইল নম্বর" : "Mobile number"}</span>
              <span className="text-[8.5px] font-bold text-[#F5B800]/70">{lang === "bn" ? "কান্ট্রি কোড লাগবে না" : "no country code"}</span>
            </span>
            <span className="flex items-center gap-2 h-11 rounded-xl border border-white/12 bg-black/40 px-3">
              <Phone size={16} className="text-[#F5B800]/70 shrink-0" />
              <input value={phone} onChange={e => { setPhone(e.target.value); if (prefilled) setPrefilled(false); }} inputMode="tel" type="tel" autoComplete="tel" autoCapitalize="none" autoCorrect="off" placeholder="01XXXXXXXXX" className="w-full bg-transparent text-sm placeholder:text-white/25 border-0 !shadow-none tabular-nums" required />
            </span>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold text-white/55 mb-1 block">{lang === "bn" ? "পাসওয়ার্ড" : "Password"}</span>
            <span className="flex items-center gap-2 h-11 rounded-xl border border-white/12 bg-black/40 px-3">
              <Lock size={16} className="text-[#F5B800]/70 shrink-0" />
              <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="••••••••" className="w-full bg-transparent text-sm placeholder:text-white/25 border-0 !shadow-none" required minLength={6} />
              <button type="button" onClick={() => setShowPw(v => !v)} className="text-white/40 hover:text-white/80" aria-label={lang === "bn" ? "পাসওয়ার্ড দেখুন/লুকান" : "Show or hide password"}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>

          {mode === "register" && (
            <label className="block">
              <span className="text-[10px] font-semibold text-white/55 mb-1 block">{lang === "bn" ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm password"}</span>
              <span className="flex items-center gap-2 h-11 rounded-xl border border-white/12 bg-black/40 px-3">
                <Lock size={16} className="text-[#F5B800]/70 shrink-0" />
                <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="••••••••" className="w-full bg-transparent text-sm placeholder:text-white/25 border-0 !shadow-none" required minLength={6} />
              </span>
            </label>
          )}

          {mode === "register" && refFromLink && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/8 px-3 py-2">
              <Gift size={14} className="mt-0.5 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-[10.5px] font-black text-emerald-400">{lang === "bn" ? "আপনি আমন্ত্রিত!" : "You're invited!"}</p>
                <p className="text-[9.5px] leading-snug text-white/60">
                  {lang === "bn" ? "বন্ধুর রেফারেল লিংক থেকে এসেছেন — অ্যাকাউন্ট খুললেই বোনাস প্রযোজ্য।" : "You arrived from a friend's referral link — the bonus applies as soon as you register."}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <p>{error}</p>
              {phoneTaken && (
                <button type="button" onClick={() => { setMode("login"); setError(null); setPhoneTaken(false); }}
                  className="mt-1.5 text-[11px] font-bold text-[#F5B800] underline">
                  {lang === "bn" ? "এই নম্বর দিয়ে লগইন করুন →" : "Log in with this number →"}
                </button>
              )}
            </div>
          )}

          {mode === "login" && (
            <button type="button" onClick={() => setRemember(v => !v)} role="checkbox" aria-checked={remember}
              aria-label={lang === "bn" ? "আমাকে মনে রাখুন" : "Remember me"}
              className="flex w-full items-center gap-2 rounded-xl px-0.5 py-0.5 text-left active:scale-[.99]">
              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                remember ? "border-[#F5B800] bg-[#F5B800] text-[#1a1300]" : "border-white/25 bg-black/40 text-transparent"}`}>
                <Check size={12} strokeWidth={3.5} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold leading-tight text-white/80">
                  {lang === "bn" ? "আমাকে মনে রাখুন" : "Remember me"}
                </span>
                <span className="block text-[8.5px] leading-tight text-white/35">
                  {lang === "bn" ? "এই ডিভাইসে লগইন থাকবে — আবার পাসওয়ার্ড দিতে হবে না" : "Stay signed in on this device — no password next time"}
                </span>
              </span>
            </button>
          )}

          <button type="submit" disabled={busy} className="gold-btn w-full h-12 rounded-xl text-sm tracking-wide flex items-center justify-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === "login" ? (lang === "bn" ? "লগইন করুন" : "Log in") : (lang === "bn" ? "অ্যাকাউন্ট খুলুন" : "Create account")}
          </button>
        </form>
      </div>
    </div>
  );
}
