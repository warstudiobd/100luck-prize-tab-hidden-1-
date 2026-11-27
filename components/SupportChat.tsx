"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Headset, Loader2, MessageCircle, ImagePlus } from "lucide-react";
import { useLang } from "./lang";

type ChatMessage = { id: number; sender: "user" | "admin"; body: string; image_url?: string; is_auto?: boolean; created_at: string };
type ChatState = { ok: boolean; conversation: { id: number; status: string } | null; messages: ChatMessage[] };

export default function SupportChat({ onClose, onAuthClick }: { onClose: () => void; onAuthClick: () => void }) {
  const { lang } = useLang();
  const [state, setState] = useState<ChatState | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attach, setAttach] = useState("");       // picture queued for the next message
  const [preview, setPreview] = useState<string | null>(null); // full-screen picture
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/chat", { cache: "no-store" });
      if (r.status === 401) { setUnauthorized(true); return; }
      const d = (await r.json()) as ChatState;
      if (d?.ok) setState(d);
    } catch { /* transient — keep last state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 3000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state?.messages.length]);

  /** Downscale a chosen picture to ≤1280px JPEG (≈≤480 KB) before sending. */
  const pickPicture = (file: File) => {
    setError(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.65, 0.5, 0.4]) {
        const data = canvas.toDataURL("image/jpeg", q);
        if (data.length <= 480_000) { setAttach(data); return; }
      }
      setAttach(canvas.toDataURL("image/jpeg", 0.4));
    };
    img.onerror = () => setError(lang === "bn" ? "ছবিটি পড়া যায়নি — অন্য ছবি চেষ্টা করুন" : "That picture could not be read — try another one");
    img.src = url;
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !attach) || sending) return;
    setSending(true); setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, image_url: attach || undefined }),
      }).then(r => r.json());
      if (r?.ok) { setDraft(""); setAttach(""); setState(r as ChatState); }
      else setError(r?.error || (lang === "bn" ? "বার্তা পাঠানো যায়নি" : "Could not send the message"));
    } catch {
      setError(lang === "bn" ? "নেটওয়ার্ক ত্রুটি — আবার চেষ্টা করুন" : "Network error — please try again");
    } finally { setSending(false); }
  };

  const bn = lang === "bn";
  const messages = state?.messages ?? [];
  const convStatus = state?.conversation?.status ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="100LUCK live support chat">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-label={bn ? "বন্ধ করুন" : "Close"} />
      <div className="relative flex h-[78vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl border border-[#F5B800]/30 bg-[#161616] shadow-[0_-8px_40px_rgba(0,0,0,.6)] sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-white/8 bg-[#1b1b1b] px-4 py-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F5B800]/15 border border-[#F5B800]/35">
            <Headset size={19} className="text-[#F5B800]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[#1b1b1b]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black text-white leading-tight">100LUCK Support · ২৪/৭</p>
            <p className="text-[9px] font-bold text-green-400">{bn ? "লাইভ — সাধারণত কয়েক মিনিটের মধ্যে রিপ্লাই পাবেন" : "Live — typically replies within a few minutes"}</p>
          </div>
          <button onClick={onClose} aria-label={bn ? "বন্ধ করুন" : "Close"} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {unauthorized ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <MessageCircle size={36} className="text-[#F5B800]" />
            <p className="text-sm font-extrabold text-white">{bn ? "চ্যাট করতে লগইন করুন" : "Log in to start chatting"}</p>
            <p className="text-[10px] text-white/55 leading-relaxed">{bn ? "সাপোর্ট টিম আপনাকে যাচাই করতে পারবে শুধু লগইন করা অ্যাকাউন্টেই।" : "Our support team can verify you only on a signed-in account."}</p>
            <button onClick={onAuthClick} className="mt-1 rounded-xl bg-[#F5B800] px-5 py-2.5 text-[11px] font-black text-black active:scale-95">
              {bn ? "লগইন / রেজিস্টার" : "Login / Register"}
            </button>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {loading && (
                <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-[#F5B800]" /></div>
              )}
              {!loading && messages.length === 0 && (
                <div className="mx-auto mt-4 max-w-[85%] rounded-2xl border border-white/8 bg-[#1f1f1f] px-4 py-3 text-center">
                  <p className="text-[10.5px] font-bold text-white/75">👋 {bn ? "স্বাগতম! আপনার সমস্যার কথা লিখুন বা পেমেন্টের স্ক্রিনশট পাঠান — আমরা আছি।" : "Welcome! Tell us what you need — you can also send a payment screenshot."}</p>
                </div>
              )}
              {convStatus === "closed" && (
                <p className="text-center text-[9px] font-bold uppercase tracking-widest text-white/35">{bn ? "এই চ্যাটটি বন্ধ হয়েছে — নতুন মেসেজ পাঠালেই আবার খুলে যাবে" : "This chat was closed — send a new message to reopen"}</p>
              )}
              {messages.map(m => m.sender === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#F5B800] px-3 py-2 text-[11px] font-semibold leading-snug text-black shadow">
                    {m.image_url ? (
                      <img src={m.image_url} alt={bn ? "পাঠানো ছবি" : "Sent picture"} onClick={() => setPreview(m.image_url!)}
                        className="mb-1 max-h-[200px] w-auto max-w-full cursor-zoom-in rounded-xl border border-black/15" />
                    ) : null}
                    {m.body}
                    <span className="mt-1 block text-right text-[7.5px] font-bold text-black/55">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-end gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5B800]/15 border border-[#F5B800]/35 text-[10px]">🎧</span>
                  <div className="max-w-[78%] rounded-2xl rounded-bl-md border border-white/8 bg-[#242424] px-3 py-2 text-[11px] leading-snug text-white/90">
                    {m.image_url ? (
                      <img src={m.image_url} alt={bn ? "সাপোর্টের ছবি" : "Support picture"} onClick={() => setPreview(m.image_url!)}
                        className="mb-1 max-h-[200px] w-auto max-w-full cursor-zoom-in rounded-xl border border-white/10" />
                    ) : null}
                    {m.body}
                    <span className="mt-1 block text-right text-[7.5px] font-bold text-white/35">{m.is_auto ? "auto · " : ""}{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="px-4 pb-1 text-center text-[9.5px] font-bold text-red-400">{error}</p>}

            {preview && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true"
                aria-label={bn ? "ছবি" : "Picture"} onClick={() => setPreview(null)}>
                <img src={preview} alt={bn ? "সংযুক্ত ছবি" : "Attachment"} className="max-h-full max-w-full rounded-2xl object-contain" />
                <button type="button" onClick={() => setPreview(null)} aria-label={bn ? "বন্ধ করুন" : "Close"}
                  className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"><X size={20} /></button>
              </div>
            )}

            {/* Composer */}
            <div className="border-t border-white/8 bg-[#1b1b1b] px-3 py-2.5">
              {attach ? (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#F5B800]/30 bg-[#F5B800]/8 px-2 py-1.5">
                  <img src={attach} alt={bn ? "সংযুক্ত ছবি" : "Attached picture"} className="h-10 w-10 rounded-lg object-cover border border-white/10" />
                  <span className="flex-1 text-[9px] font-bold text-white/70">{bn ? "ছবি সংযুক্ত — পাঠাতে টিপুন" : "Picture attached — tap send"}</span>
                  <button type="button" onClick={() => setAttach("")} aria-label={bn ? "ছবি সরান" : "Remove picture"}
                    className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"><X size={14} /></button>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickPicture(f); e.target.value = ""; }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={sending}
                  aria-label={bn ? "ছবি দিন" : "Attach a picture"} title={bn ? "ছবি দিন" : "Attach a picture"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-[#232323] text-[#F5B800] active:scale-95 disabled:opacity-40">
                  <ImagePlus size={19} />
                </button>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") send(); }}
                  maxLength={2000}
                  placeholder={attach ? (bn ? "ক্যাপশন (ঐচ্ছিক)…" : "Add a caption (optional)…") : (bn ? "বার্তা লিখুন…" : "Type a message…")}
                  aria-label={bn ? "বার্তা" : "Message"}
                  className="h-11 flex-1 rounded-2xl border border-white/10 bg-[#232323] px-4 text-[12px] text-white outline-none placeholder:text-white/35 focus:border-[#F5B800]/60"
                />
                <button onClick={send} disabled={sending || (!draft.trim() && !attach)} aria-label={bn ? "পাঠান" : "Send"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F5B800] text-black active:scale-95 disabled:opacity-40">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.4} />}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[8px] text-white/30">
                {bn ? "টেলিগ্রামেও পাবেন: @warstudiosite" : "Or reach us on Telegram: @warstudiosite"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
