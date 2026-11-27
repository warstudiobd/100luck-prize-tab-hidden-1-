/**
 * Bangladeshi mobile number normalisation.
 *
 * Players type the same number in many ways: "01852625293", "+880 1852-625293",
 * "8801852625293", "01852 625 293" (copy-paste from bKash/SMS adds spaces and
 * dashes, and many people paste the international form). The canonical local
 * form (01XXXXXXXXX) is what we store in users.username_or_phone; the +880 form
 * goes to users.phone, which is what the game provider sees.
 *
 * Everything else is rejected so we never create a half-valid account.
 */

/** Canonical 01XXXXXXXXX, or null when it is not a BD mobile number. */
export function normaliseBdPhone(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  // Unicode digits (Bangla ০-৯ / Arabic-Indic) → ASCII
  s = s.replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
       .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[\s\-().\u2010-\u2015]/g, ""); // spaces, dashes, dots, brackets
  s = s.replace(/^\++/, "");
  if (/^8801\d{9}$/.test(s)) s = s.slice(2);        // 8801852... → 01852...
  else if (/^008801\d{9}$/.test(s)) s = s.slice(4); // 008801852... → 01852...
  else if (/^1[3-9]\d{8}$/.test(s)) s = `0${s}`;    // 1852625293 → 01852625293
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}

/** +8801XXXXXXXXX, used for users.phone (provider-facing). */
export function toIntlBdPhone(local: string): string {
  return `+880${local.slice(1)}`;
}
