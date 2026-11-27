import type { Metadata } from "next";
import Link from "next/link";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * Branded 404 — v55.
 *
 * Before this file, a missing URL showed Next's bare "404 This page could not be
 * found". Two problems with that: a visitor read it as a dead site, and a crawler
 * found a dead end with no way forward. This page keeps the brand, links back to
 * the live screens, and is explicitly noindex so it never competes in search.
 */
export const metadata: Metadata = {
  title: "পাতা পাওয়া যায়নি · Page not found · 100LUCK",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center">
      <p className="gold-text text-5xl font-black tracking-tight">404</p>
      <h1 className="text-sm font-black text-white/85">
        এই পাতাটি পাওয়া যায়নি · This page does not exist
      </h1>
      <p className="max-w-[300px] text-[11px] leading-relaxed text-white/45">
        লিংকটি পুরোনো হতে পারে। নিচের হোম বাটনে চাপ দিলেই খেলা ও ওয়ালেটে ফিরে যাবেন।
        <br />
        The link may be out of date — tap below to get back to the lobby.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="gold-btn rounded-xl px-5 py-3 text-xs font-black">হোম · Home</Link>
        <Link href="/promotion" className="rounded-xl border border-[#F5B800]/40 bg-[#F5B800]/10 px-4 py-3 text-xs font-black text-[#F5B800]">প্রমোশন · Promotions</Link>
        <a href="/member/support" className="rounded-xl border border-white/15 px-4 py-3 text-xs font-black text-white/70">সাপোর্ট · Support</a>
      </div>
      <p className="mt-3 text-[8px] uppercase tracking-[.3em] text-white/25">{CANONICAL_SITE_URL.replace("https://", "")} · 18+</p>
    </main>
  );
}
