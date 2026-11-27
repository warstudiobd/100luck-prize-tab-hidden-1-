/**
 * v37 — the site moved to warstudio.site.
 *
 * These two settings drive every URL we hand to PayWise:
 *   site_url             → the return_url the player comes back to
 *   paywise_webhook_url  → the callback PayWise POSTs the payment result to
 *
 * Editable in the admin panel (Settings → Payment URLs), so the next domain
 * change needs no deploy. lib/site-url.ts falls back to env SITE_URL and then
 * to https://warstudio.site when these are empty.
 */
INSERT INTO platform_settings (key, value) VALUES
  ('site_url', 'https://warstudio.site'),
  ('paywise_webhook_url', 'https://warstudio.site/api/payments/paywise/webhook')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
