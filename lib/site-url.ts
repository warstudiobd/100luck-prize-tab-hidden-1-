/**
 * One source of truth for "what is my public address?".
 *
 * Used for the URLs we hand to third parties: the PayWise return_url the player
 * comes back to after paying, and the webhook (callback) URL PayWise posts the
 * payment result to. Both break the moment the site moves to a new domain, so
 * the answer is resolved in this order, first hit wins:
 *
 *   1. platform_settings.site_url          — change it from the admin Settings
 *                                            screen, no deploy needed
 *   2. env SITE_URL / NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL
 *   3. https://warstudio.site              — the site's own domain (v37)
 *   4. the request's own origin            — last resort, always correct for
 *                                            whatever host the player is on
 *
 * The request origin is deliberately NOT first: behind Vercel a request can
 * arrive on a *.vercel.app preview host, and a webhook URL on a host PayWise
 * does not know is exactly the bug this file exists to prevent.
 */
import { query } from "./db";

const clean = (u: unknown): string => {
  const s = String(u ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s) ? s : "";
};

/**
 * The build-time canonical address, used for <link rel="canonical">, metadataBase,
 * robots.txt and the sitemap — everything that has to be a compile-time string
 * because those pages are statically generated.
 *
 * It is env-driven so moving to a new domain is an environment change plus a
 * redeploy, never a code edit and never a hunt through 26 files:
 *
 *     NEXT_PUBLIC_SITE_URL=https://newdomain.com   (set in Vercel → Settings → Env)
 *
 * The runtime counterparts that talk to third parties (PayWise return_url and the
 * webhook callback) do NOT use this: they read `platform_settings.site_url` first,
 * which can be changed from the admin panel with no deploy at all. See getSiteUrl().
 */
const DEFAULT_SITE_URL = "https://warstudio.site";

export const CANONICAL_SITE_URL =
  clean(process.env.NEXT_PUBLIC_SITE_URL) ||
  clean(process.env.SITE_URL) ||
  DEFAULT_SITE_URL;

/** Settings the operator can edit in the admin panel (cached 60s per lambda). */
let cache: { at: number; url: string; webhook: string } | null = null;

export async function getSiteUrl(requestOrigin?: string): Promise<string> {
  const now = Date.now();
  if (!cache || now - cache.at > 60_000) {
    const rows = await query(
      "SELECT key, value FROM platform_settings WHERE key IN ('site_url','paywise_webhook_url')"
    ).catch(() => [] as any[]);
    const m = Object.fromEntries((rows as any[]).map(r => [String(r.key), String(r.value)]));
    cache = { at: now, url: clean(m.site_url), webhook: clean(m.paywise_webhook_url) };
  }
  return (
    cache.url ||
    clean(process.env.SITE_URL) ||
    clean(process.env.NEXT_PUBLIC_SITE_URL) ||
    clean(process.env.NEXT_PUBLIC_APP_URL) ||
    CANONICAL_SITE_URL ||
    clean(requestOrigin)
  );
}

/** The exact URL to paste into the PayWise dashboard as the callback. */
export async function getWebhookUrl(): Promise<string> {
  await getSiteUrl();
  return cache?.webhook || `${await getSiteUrl()}/api/payments/paywise/webhook`;
}

/** Return URL for a finished payment — always back to the real site, never a preview host. */
export async function getReturnUrl(qs: Record<string, string | number | undefined>): Promise<string> {
  const base = await getSiteUrl();
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) if (v !== undefined && v !== "") params.set(k, String(v));
  const s = params.toString();
  return `${base}/deposit${s ? `?${s}` : ""}`;
}

/** Drop the memo — call after an admin saves the settings. */
export function forgetSiteUrlCache() { cache = null; }
