"use client";

/**
 * Route-level crash screen.
 *
 * Without this file, an uncaught error inside any page replaced the whole app with a
 * blank screen — the "page couldn't load" the player sees. Next.js only falls back to
 * the bare server error page when no boundary exists, and that page has no branding,
 * no way back, and looks like the site is dead.
 *
 * This keeps the player inside the app: a clear message in their language and two
 * buttons that actually work. The most common real cause is a stale cached bundle
 * after a deploy, so "reload" is the primary action.
 */
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log once for the browser console; there is no telemetry endpoint in this app.
    console.error("[100LUCK] route error:", error?.message, error?.digest);
  }, [error]);

  const isChunkError =
    /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      String(error?.message || "")
    );

  /** A hard reload, bypassing the browser cache, is what fixes a chunk mismatch. */
  const hardReload = () => {
    try {
      // cache-busting query so the browser re-fetches the document from the network
      const u = new URL(window.location.href);
      u.searchParams.set("_r", String(Date.now()));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="gold-text text-3xl font-black tracking-tight">
        {isChunkError ? "App updated" : "Something went wrong"}
      </h1>
      <p className="mt-1 text-[13px] font-black text-white/85">
        {isChunkError ? "অ্যাপ আপডেট হয়েছে — একবার রিলোড করুন" : "কিছু একটা ভুল হয়েছে"}
      </p>
      <p className="mt-3 max-w-[300px] text-[11px] leading-relaxed text-white/45">
        {isChunkError
          ? "A new version was deployed while this page was open. Reloading picks it up — your balance and history are safe."
          : "This screen could not be shown. Reloading usually fixes it. Your balance and history are safe."}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={hardReload}
          className="gold-btn h-10 rounded-xl px-5 text-[12px] font-black"
        >
          Reload
        </button>
        <button
          onClick={() => reset()}
          className="h-10 rounded-xl border border-white/15 bg-white/[.04] px-4 text-[11px] font-black text-white/70"
        >
          Try again
        </button>
        <a
          href="/"
          className="h-10 rounded-xl border border-white/15 bg-white/[.04] px-4 text-[11px] font-black leading-10 text-white/70"
        >
          Home
        </a>
      </div>
    </div>
  );
}
