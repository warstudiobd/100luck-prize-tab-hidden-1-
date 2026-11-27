/** Admin: test a provider's live API + pull its game list.
 *
 *  POST { id }                → connectivity test (balance/list/subscription probe)
 *  POST { id, action:"sync" } → fetch the catalogue and upsert into games_catalog
 *
 *  Sync is tolerant: it understands the common shapes aggregators return
 *  ({ data: [...] }, { games: [...] }, { list: [...] }) and maps the usual
 *  field aliases (game_code/code/id, game_name/name/title, …). Nothing is
 *  deleted — games that vanish upstream are simply deactivated.
 */
import { NextRequest } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { getProviderSecrets, providerRequest } from "@/lib/provider-auth";
import { GAME_CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

type ProviderRow = {
  id: number; code: string; name: string; api_base_url: string | null; api_config: Record<string, string> | null;
  auth_type: string; sync_path: string | null; launch_path: string | null; default_category: string;
};

function pickList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of ["data", "games", "list", "items", "result", "rows"]) {
    const v = data[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const nested = pickList(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function mapCategory(raw: unknown, fallback: string): string {
  const t = norm(raw);
  if (!t) return fallback;
  const table: Array<[RegExp, string]> = [
    [/SLOT/, "SLOTS"],
    [/FISH|CAST|SHOOT/, "FISHING"],
    [/LIVE|CASINO|DEALER|ROULETTE|BLACKJACK|BACCARAT/, "LIVE"],
    [/LOTTERY|KENO|BINGO|LOTTO/, "LOTTERY"],
    [/SPORT|BET|SOCCER|CRICKET/, "SPORTS"],
    [/ARCADE|MINI|CRASH|DICE|TABLE/, "ARCADE"],
    [/POKER|CARD/, "POKER"],
  ];
  for (const [re, cat] of table) if (re.test(t)) return cat;
  return (GAME_CATEGORIES as readonly string[]).includes(t) ? t : fallback;
}

function mapGame(raw: any, provider: ProviderRow) {
  const code = String(
    raw.game_code ?? raw.gameCode ?? raw.code ?? raw.id ?? raw.game_id ?? raw.gameId ?? raw.slug ?? ""
  ).trim();
  const name = String(raw.game_name ?? raw.gameName ?? raw.name ?? raw.title ?? raw.label ?? code).trim();
  if (!code || !name) return null;
  const cat = mapCategory(raw.category ?? raw.game_type ?? raw.type ?? raw.game_category ?? raw.tab, provider.default_category);
  const thumb = String(raw.icon ?? raw.image ?? raw.thumbnail ?? raw.img ?? raw.cover ?? raw.logo ?? "").trim();
  return {
    game_code: code.slice(0, 64),
    game_name: name.slice(0, 120),
    category: cat,
    thumbnail_url: /^https:\/\//i.test(thumb) ? thumb.slice(0, 500) : "",
  };
}

async function loadProvider(id: number): Promise<ProviderRow | null> {
  const [row] = await query(
    `SELECT id, code, name, api_base_url, api_config, auth_type, sync_path, launch_path,
            COALESCE(default_category,'SLOTS') AS default_category
       FROM game_providers WHERE id = $1`,
    [id]
  );
  return row ? ({ ...row, id: Number(row.id) } as ProviderRow) : null;
}

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.id));
  if (!Number.isFinite(id) || id <= 0) return corsError("provider id required", 400);
  const action = String(body.action ?? "test").toLowerCase();

  const p = await loadProvider(id);
  if (!p) return corsError("provider not found", 404);
  if (!p.api_base_url) return corsError(`${p.name} has no API base URL yet — add it in the API tab`, 400);

  const secrets = await getProviderSecrets(p.code);
  if (!secrets.key) {
    return corsJson({
      ok: false,
      needs_credentials: true,
      error: `${p.name} has no secret key stored. Paste the API key from the company, then test again.`,
    });
  }

  const creds = {
    baseUrl: p.api_base_url,
    authType: (["hmac", "bearer", "basic", "query"].includes(p.auth_type) ? p.auth_type : "hmac") as any,
    key: secrets.key,
    keyId: secrets.keyId,
    apiConfig: p.api_config ?? {},
  };

  if (action === "test") {
    const path = (body.path ? String(body.path) : p.sync_path || "games").slice(0, 128);
    const res = await providerRequest(creds, path, { merchant: creds.keyId, currency: creds.apiConfig.currency ?? "BDT" }, { timeoutMs: 12_000 });
    const sample = pickList(res.data).slice(0, 3);
    return corsJson({
      ok: res.ok,
      http_status: res.status,
      endpoint: path,
      games_found: pickList(res.data).length,
      sample_games: sample.map((g) => mapGame(g, p)).filter(Boolean),
      message: res.ok
        ? `${p.name} responded — ${pickList(res.data).length} games visible on "${path}"`
        : `${p.name} did not respond cleanly: ${JSON.stringify(res.data).slice(0, 300)}`,
    });
  }

  if (action === "sync") {
    const path = (body.path ? String(body.path) : p.sync_path || "games").slice(0, 128);
    const res = await providerRequest(creds, path, { merchant: creds.keyId, currency: creds.apiConfig.currency ?? "BDT" }, { timeoutMs: 20_000 });
    if (!res.ok) {
      return corsJson({ ok: false, http_status: res.status, error: `Sync failed: ${JSON.stringify(res.data).slice(0, 300)}` });
    }
    const mapped = pickList(res.data).map((g) => mapGame(g, p)).filter(Boolean) as Array<{
      game_code: string; game_name: string; category: string; thumbnail_url: string;
    }>;
    if (!mapped.length) return corsJson({ ok: false, error: "Provider returned no recognisable games — check the sync path and response shape" });

    let inserted = 0, updated = 0, deactivated = 0;
    for (const g of mapped) {
      const existing = await query("SELECT id FROM games_catalog WHERE provider_id = $1 AND game_code = $2", [p.id, g.game_code]);
      if (existing.length) {
        await query(
          `UPDATE games_catalog SET game_name = $1, category = $2, thumbnail_url = COALESCE(NULLIF($3,''), thumbnail_url),
                  is_active = TRUE WHERE id = $4`,
          [g.game_name, g.category, g.thumbnail_url, existing[0].id]
        );
        updated++;
      } else {
        await query(
          `INSERT INTO games_catalog (game_code, game_name, category, thumbnail_url, is_active, is_hot, sort_order, provider_id, provider_code)
           VALUES ($1,$2,$3,$4,TRUE,FALSE,500,$5,$6)`,
          [g.game_code, g.game_name, g.category, g.thumbnail_url, p.id, p.code]
        );
        inserted++;
      }
    }
    const seen = mapped.map((g) => g.game_code);
    const stale = await query(
      `UPDATE games_catalog SET is_active = FALSE
        WHERE provider_id = $1 AND is_active = TRUE AND NOT (game_code = ANY($2::text[]))
        RETURNING id`,
      [p.id, seen]
    );
    deactivated = stale.length;

    await query("UPDATE game_providers SET updated_at = now() WHERE id = $1", [p.id]);
    return corsJson({
      ok: true,
      inserted, updated, deactivated, total: mapped.length,
      message: `Synced ${mapped.length} games from ${p.name} (${inserted} new, ${updated} refreshed, ${deactivated} deactivated)`,
    });
  }

  if (action === "launch") {
    // Live launch: ask the provider for a game URL for this player and open it.
    const { getSessionUserId } = await import("@/lib/auth");
    const sess = await getSessionUserId();
    if (!sess) return corsError("player session required for launch", 401);
    const gameCode = String(body.game_code ?? "").trim().slice(0, 64);
    if (!gameCode) return corsError("game_code required", 400);
    const path = (p.launch_path || "launch").slice(0, 128);
    const res = await providerRequest(creds, path, {
      merchant: creds.keyId,
      player: String(sess.sub),
      game: gameCode,
      currency: creds.apiConfig.currency ?? "BDT",
      token: crypto.randomUUID(),
      return_url: `${CANONICAL_SITE_URL}/`,
    }, { timeoutMs: 15_000 });
    const url = res.data?.url ?? res.data?.game_url ?? res.data?.launch_url ?? res.data?.data?.url ?? res.data?.data?.game_url ?? "";
    if (!res.ok || !/^https:\/\//i.test(String(url))) {
      return corsJson({ ok: false, error: `Launch failed: ${JSON.stringify(res.data).slice(0, 300)}` });
    }
    return corsJson({ ok: true, url });
  }

  return corsError("action must be test, sync or launch", 400);
}
