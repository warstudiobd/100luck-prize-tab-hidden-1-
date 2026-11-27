/** Shared validation for admin-supplied images (URL or data URI from client-side resize). */
export const IMAGE_URL_MAX = 500_000; // ~500 KB base64 data URI ceiling
const DATA_URI_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

/** Returns a safe image string ("", https URL, or data URI) or null when invalid. */
export function sanitizeImageUrl(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (v.length > IMAGE_URL_MAX) return null;
  if (DATA_URI_RE.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" && u.hostname.length > 3) return v;
  } catch { /* not a URL */ }
  return null;
}
