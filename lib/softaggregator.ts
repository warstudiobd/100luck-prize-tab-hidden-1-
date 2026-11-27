/**
 * SoftAggregator Casino Games API client (verified against softaggregator.com/docs.html).
 * Base URL: POST ${SOFTAGG_BASE_URL} with JSON { api_login, api_password, method, ...params }.
 * If SOFTAGG_API_LOGIN / SOFTAGG_API_PASSWORD are empty the client runs in DEMO/SANDBOX mode.
 */
import crypto from "crypto";
import { query } from "./db";

const BASE = (process.env.SOFTAGG_BASE_URL || "https://api.softaggregator.com/api/v1").replace(/\/$/, "");
const LOGIN = process.env.SOFTAGG_API_LOGIN || "";
const PASSWORD = process.env.SOFTAGG_API_PASSWORD || "";

export const isDemoMode = () => !(LOGIN && PASSWORD);
export interface RpcResult { ok: boolean; demo: boolean; data?: any; error?: string; raw?: any }

async function rpc(method: string, params: Record<string, any> = {}): Promise<RpcResult> {
  if (isDemoMode()) return demoRpc(method, params);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_login: LOGIN, api_password: PASSWORD, method, ...params }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { rawText: text }; }
    const err = json?.error;
    const ok = res.ok && (err === 0 || err === "0");
    const message = typeof json?.message === "string" ? json.message : typeof json?.error_description === "string" ? json.error_description : undefined;
    return { ok, demo: false, data: json, raw: json, error: ok ? undefined : (message || `provider error ${err ?? res.status}`) };
  } catch (err: any) {
    return { ok: false, demo: false, error: err?.name === "AbortError" ? "provider timeout (15s)" : String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

export function responseOf(data: any): any {
  return data?.response ?? data?.result ?? data?.data ?? data;
}
const isLaunchable = (u: any): u is string =>
  typeof u === "string" && (/^https?:\/\//i.test(u) || u.startsWith("/"));

function pickUrl(data: any): string | null {
  const r = responseOf(data);
  if (isLaunchable(r)) return r;
  if (!data || typeof data !== "object") return null;
  const candidates: any[] = [data.url, data.game_url, data.launch_url, data.response?.url, data.result?.url, data.data?.url];
  for (const c of candidates) if (isLaunchable(c)) return c;
  const seen = new Set<any>();
  const stack = [data];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const v of Object.values(cur)) {
      if (isLaunchable(v)) return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

const DEMO_PROVIDERS = [
  { provider: "jili", name: "JILI Games", logo: "", games: 300 },
  { provider: "fanchai", name: "Fa Chai Gaming", logo: "", games: 80 },
  { provider: "spribe", name: "Spribe", logo: "", games: 20 },
];
const DEMO_GAMES = [
  { provider: "jili", provider_code: "JILI", game_code: "jili_super_ace", name: "Super Ace", game_type: "slots", id_hash: "jili_super_ace", image: "/thumbs/jili_super_ace.svg", featured: true },
  { provider: "jili", provider_code: "JILI", game_code: "jili_fortune_gems", name: "Fortune Gems", game_type: "slots", id_hash: "jili_fortune_gems", image: "/thumbs/jili_fortune_gems.svg", featured: true },
  { provider: "jili", provider_code: "JILI", game_code: "jili_money_coming", name: "Money Coming", game_type: "slots", id_hash: "jili_money_coming", image: "/thumbs/jili_money_coming.svg", featured: true },
  { provider: "jili", provider_code: "JILI", game_code: "jili_boxing_king", name: "Boxing King", game_type: "slots", id_hash: "jili_boxing_king", image: "/thumbs/jili_boxing_king.svg", featured: true },
  { provider: "jili", provider_code: "JILI", game_code: "jili_super_elements", name: "Super Elements", game_type: "slots", id_hash: "jili_super_elements", image: "/thumbs/jili_super_elements.svg", featured: true },
  { provider: "spribe", provider_code: "SPRIBE", game_code: "spribe_aviator", name: "Aviator", game_type: "crash", id_hash: "spribe_aviator", image: "/thumbs/spribe_aviator.svg", featured: true },
];

async function demoRpc(method: string, params: any): Promise<RpcResult> {
  switch (method) {
    case "getProviderList": return { ok: true, demo: true, data: { error: 0, response: DEMO_PROVIDERS } };
    case "getCurrencies": return { ok: true, demo: true, data: { error: 0, response: { default: "BDT", currencies: ["BDT"], settlement: "EUR" } } };
    case "getGameList": {
      try {
        const rows = await query("SELECT provider_code, game_code, title, category, thumbnail_url, is_hot FROM games_catalog ORDER BY sort_order");
        const mapped = rows.map(r => ({ provider: String(r.provider_code).toLowerCase(), provider_code: r.provider_code, id_hash: r.game_code, game_code: r.game_code, name: r.title, game_type: String(r.category || "").toLowerCase(), image: r.thumbnail_url, featured: !!r.is_hot }));
        return { ok: true, demo: true, data: { error: 0, response: mapped.length ? mapped : DEMO_GAMES } };
      } catch { return { ok: true, demo: true, data: { error: 0, response: DEMO_GAMES } }; }
    }
    case "createPlayer": return { ok: true, demo: true, data: { error: 0, response: { user_username: params?.user_username, status: "ensured" } } };
    case "getCreditBalance": return { ok: true, demo: true, data: { error: 0, response: { credit_balance: 0, currency: "EUR", low_balance_threshold: 0 } } };
    case "getPlayerHistory": return { ok: true, demo: true, data: { error: 0, response: { rounds: [], total: 0, limit: params?.limit ?? 50, offset: params?.offset ?? 0 } } };
    case "getGame":
    case "getGameDemo": return { ok: true, demo: true, data: { error: 0, response: `/play/demo?game=${encodeURIComponent(params?.gameid ?? params?.game_code ?? "jili_super_ace")}` } };
    default: return { ok: true, demo: true, data: { error: 0, response: { method, note: "demo mode — no upstream call made" } } };
  }
}

/** Deterministic, non-plaintext provider password. Stable across deploys; not stored in the DB. */
export function providerPasswordFor(user: { id: number | string; username_or_phone: string }): string {
  const secret = process.env.SOFTAGG_PLAYER_SECRET || process.env.JWT_SECRET || "insecure_dev_secret_change_me";
  return crypto.createHash("sha256").update(`softaggregator:${secret}:${user.id}:${user.username_or_phone}`).digest("hex").slice(0, 32);
}

export const softaggregator = {
  getProviderList: () => rpc("getProviderList"),
  getCurrencies: () => rpc("getCurrencies"),
  getGameList: () => rpc("getGameList"),
  getCreditBalance: () => rpc("getCreditBalance"),
  createPlayer: (input: { username: string; password: string; currency?: string; email: string; phone: string }) =>
    rpc("createPlayer", {
      user_username: input.username,
      user_password: input.password,
      currency: input.currency || "BDT",
      email: input.email,
      phone: input.phone,
    }),
  getPlayerHistory: (input: { username: string; limit?: number; offset?: number; gameid?: string; round_id?: string; date_from?: string; date_to?: string }) =>
    rpc("getPlayerHistory", {
      user_username: input.username,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      gameid: input.gameid,
      round_id: input.round_id,
      date_from: input.date_from,
      date_to: input.date_to,
    }),
  async getGame(input: { username: string; password: string; gameid: string; lang?: string; currency?: string; email?: string | null; phone?: string | null; country?: string; homeurl?: string; device?: "desktop" | "mobile"; playForFun?: boolean }) {
    const r = await rpc(input.playForFun ? "getGameDemo" : "getGame", {
      user_username: input.username,
      user_password: input.password,
      gameid: input.gameid,
      lang: input.lang || "en",
      currency: input.currency || "BDT",
      email: input.email || undefined,
      phone: input.phone || undefined,
      country: input.country,
      device: input.device || "desktop",
      homeurl: input.homeurl,
      play_for_fun: input.playForFun ? 1 : undefined,
    });
    if (!r.ok) return { ok: false as const, demo: r.demo, error: r.error || "provider launch failed" };
    const url = pickUrl(r.data);
    if (!url) return { ok: false as const, demo: r.demo, error: "provider response contained no game URL" };
    return { ok: true as const, demo: r.demo, url };
  },
};
