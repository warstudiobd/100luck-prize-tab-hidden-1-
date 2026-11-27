/** Admin platform settings — withdraw turnover rule and cashier notice. */
import { NextRequest } from "next/server";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings";
import { CANONICAL_SITE_URL, forgetSiteUrlCache, getSiteUrl, getWebhookUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const turnoverCents = Math.trunc(Number(await getSetting(SETTING_KEYS.withdrawMinTurnover, "200000"))) || 0;
  const notice = await getSetting(SETTING_KEYS.withdrawNotice, "");
  // Payment URLs: what the operator should type into the PayWise dashboard.
  const siteUrl = await getSiteUrl();
  return corsJson({
    ok: true,
    withdraw_min_turnover_cents: turnoverCents,
    withdraw_notice: notice,
    site_url: siteUrl,
    site_url_override: await getSetting(SETTING_KEYS.siteUrl, ""),
    paywise_webhook_url: await getWebhookUrl(),
    paywise_webhook_override: await getSetting(SETTING_KEYS.paywiseWebhookUrl, ""),
    canonical_site_url: CANONICAL_SITE_URL,
    paywise_return_url: `${siteUrl}/deposit`,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const changed: string[] = [];

  if (body.withdraw_min_turnover_cents !== undefined) {
    const cents = Math.trunc(Number(body.withdraw_min_turnover_cents));
    if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) {
      return corsError("turnover must be between ৳0 and ৳1,000,000", 400);
    }
    await setSetting(SETTING_KEYS.withdrawMinTurnover, String(cents));
    changed.push("withdraw_min_turnover_cents");
  }

  if (body.withdraw_notice !== undefined) {
    const notice = String(body.withdraw_notice).trim().slice(0, 500);
    await setSetting(SETTING_KEYS.withdrawNotice, notice);
    changed.push("withdraw_notice");
  }

  // Public site address — https only, bare host, no path. Empty clears the override.
  if (body.site_url !== undefined) {
    const raw = String(body.site_url ?? "").trim().replace(/\/+$/, "");
    if (raw && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(raw)) {
      return corsError("site URL must look like https://yourdomain.com", 400);
    }
    await setSetting(SETTING_KEYS.siteUrl, raw);
    changed.push("site_url");
  }

  // Callback URL PayWise posts to. Empty = <siteUrl>/api/payments/paywise/webhook.
  if (body.paywise_webhook_url !== undefined) {
    const raw = String(body.paywise_webhook_url ?? "").trim();
    if (raw && !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(raw)) {
      return corsError("webhook URL must be a full https:// address", 400);
    }
    await setSetting(SETTING_KEYS.paywiseWebhookUrl, raw);
    changed.push("paywise_webhook_url");
  }
  if (body.site_url !== undefined || body.paywise_webhook_url !== undefined) forgetSiteUrlCache();

  if (!changed.length) return corsError("nothing to update", 400);

  const turnoverCents = Math.trunc(Number(await getSetting(SETTING_KEYS.withdrawMinTurnover, "200000"))) || 0;
  const notice = await getSetting(SETTING_KEYS.withdrawNotice, "");
  const siteUrl = await getSiteUrl();
  return corsJson({
    ok: true, changed,
    withdraw_min_turnover_cents: turnoverCents, withdraw_notice: notice,
    site_url: siteUrl,
    site_url_override: await getSetting(SETTING_KEYS.siteUrl, ""),
    paywise_webhook_url: await getWebhookUrl(),
    paywise_webhook_override: await getSetting(SETTING_KEYS.paywiseWebhookUrl, ""),
    paywise_return_url: `${siteUrl}/deposit`,
  });
}
