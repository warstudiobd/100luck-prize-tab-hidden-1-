/** Format integer cents as Bangladeshi taka, e.g. ৳ 25,000.00 (en-IN lakh grouping). */
export function formatTaka(cents: number, withSymbol = true): string {
  const n = (Number(cents || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `৳ ${n}` : n;
}
export function parseTakaToCents(input: string | number): number {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[৳,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

/** ৳1,000 — decimals only when the amount really has paisa. Used in tight
 *  inline labels where "৳ 1,000.00" would break across two lines. */
export function formatTakaCompact(cents: number): string {
  const n = Number(cents || 0) / 100;
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `৳${n.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
