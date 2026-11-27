"use client";

/**
 * Last-resort boundary. `app/error.tsx` cannot catch a crash in the ROOT layout
 * (it lives inside that layout), so this renders its own <html>/<body>.
 *
 * Kept dependency-free and inline-styled on purpose: if the root layout failed, no
 * stylesheet or component from it can be trusted to load.
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[100LUCK] global error:", error?.message, error?.digest);
  }, [error]);

  return (
    <html lang="bn">
      <body style={{ margin: 0, background: "#121212", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F5B800", margin: 0 }}>100LUCK</h1>
          <p style={{ marginTop: 12, fontSize: 14, fontWeight: 800 }}>
            কিছু একটা ভুল হয়েছে · Something went wrong
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.55)", maxWidth: 300, lineHeight: 1.6 }}>
            Please reload the page. Your balance and history are safe.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
            <button
              onClick={() => { try { window.location.replace("/?r=" + Date.now()); } catch { window.location.reload(); } }}
              style={{ height: 40, padding: "0 22px", borderRadius: 12, border: "none", background: "#F5B800", color: "#111", fontSize: 13, fontWeight: 900 }}
            >
              Reload
            </button>
            <button
              onClick={() => reset()}
              style={{ height: 40, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "rgba(255,255,255,.75)", fontSize: 12, fontWeight: 800 }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
