/** Optional callback IP allowlist: SOFTAGG_IP_ALLOWLIST="1.2.3.4, 203.0.113.0/24"
 *  Unset/empty → allow all (development default). Reads x-forwarded-for (first hop) or x-real-ip. */
import type { NextRequest } from "next/server";

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
export function matchIp(ip: string, rule: string): boolean {
  if (rule === ip) return true;
  const slash = rule.indexOf("/");
  if (slash > 0) {
    const base = ipToInt(rule.slice(0, slash));
    const bits = Number(rule.slice(slash + 1));
    const cur = ipToInt(ip);
    if (base === null || cur === null || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (base & mask) === (cur & mask);
  }
  return false;
}
export function ipAllowed(req: NextRequest): boolean {
  const rules = (process.env.SOFTAGG_IP_ALLOWLIST || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!rules.length) return true; // open in dev; set this in production
  const ip = clientIp(req);
  return rules.some(r => matchIp(ip, r));
}
