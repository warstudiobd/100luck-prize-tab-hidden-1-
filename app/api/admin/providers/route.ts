/** Admin game-provider registry — add/configure any aggregator company (FC Gaming, JILI, …).
 *
 *  Credentials are NOT stored here: api_config holds non-secret ids (merchant,
 *  agent, currency) and the secret key is read from the environment variable
 *  named in api_config.key_env (default <CODE>_API_KEY), mirroring how the
 *  deposit gateway keeps DEPOSIT_API_KEY out of the database.
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";
import { GAME_CATEGORIES } from "@/lib/types";
import { PROVIDER_SECRET_RE, PROVIDER_KEYID_RE, storeProviderSecrets, codesWithSecrets } from "@/lib/provider-auth";

export const dynamic = "force-dynamic";

export const AUTH_TYPES = new Set(["hmac", "bearer", "basic", "query"]);

function cleanCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 32).replace(/^_|_$/g, "");
}

function cleanApiConfig(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 48);
    if (!key) continue;
    const val = String(v ?? "").trim().slice(0, 160);
    if (val) out[key] = val;
  }
  return out;
}

/** Which env var holds this provider's secret, and whether it is present. */
export function secretEnvName(code: string, apiConfig: Record<string, string>): string {
  return apiConfig.key_env || `${code}_API_KEY`;
}

/** Secrets live in api_config.key / key_id. They are validated then stripped
 *  from the stored config; the signed routes read them back inside the
 *  server-only PROVIDER_SECRETS blob, so credentials never leave an API call. */
function splitSecrets(cfg: Record<string, string>) {
  const { key, key_id, ...rest } = cfg;
  if (key && !PROVIDER_SECRET_RE.test(key)) throw new Error("Secret key must be 16–200 characters (letters, numbers, . _ - / + =)");
  if (key_id && !PROVIDER_KEYID_RE.test(key_id)) throw new Error("Invalid key id / agent token (2–160 letters, numbers, . _ - / + = :)");
  return { rest, key: key ?? "", keyId: key_id ?? "" };
}

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const rows = await query(
    `SELECT p.id, p.code, p.name, p.logo_url, p.api_base_url, p.api_config, p.auth_type,
            p.sync_path, p.launch_path, p.default_category, p.is_active, p.updated_at,
            (SELECT COUNT(*)::int FROM games_catalog g WHERE g.provider_id = p.id) AS game_count
     FROM game_providers p
     ORDER BY p.is_active DESC, p.name ASC`
  );
  const stored = await codesWithSecrets();
  const out = (rows as any[]).map((r) => {
    const cfg = (r.api_config ?? {}) as Record<string, string>;
    const envName = secretEnvName(r.code, cfg);
    const fromEnv = Boolean(String(process.env[envName] ?? "").trim());
    const isStored = stored.has(r.code);
    return {
      ...r,
      id: Number(r.id),
      api_config: cfg,
      secret_env: envName,
      secret_present: isStored || fromEnv,
      secret_source: isStored ? "stored" : fromEnv ? "env" : "",
    };
  });
  return corsJson({ ok: true, categories: GAME_CATEGORIES, providers: out });
}

export async function DELETE(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const id = Math.trunc(Number(searchParams.get("id")));
  if (!Number.isFinite(id) || id <= 0) return corsError("id required", 400);

  const [p] = await query("SELECT id, code, name FROM game_providers WHERE id = $1", [id]);
  if (!p) return corsError("provider not found", 404);

  const [{ games }] = await query("SELECT COUNT(*)::int AS games FROM games_catalog WHERE provider_id = $1", [id]);
  const [{ rounds }] = await query("SELECT COUNT(*)::int AS rounds FROM wallet_ledger WHERE provider_code = $1", [p.code]);
  if (Number(rounds) > 0) {
    return corsError(`${p.name} already has player transactions — switch it off instead of deleting it`, 409);
  }
  if (Number(games) > 0) {
    return corsError(`${p.name} still has ${games} games in the catalog — switch it off, or sync it empty first`, 409);
  }
  await query("DELETE FROM game_providers WHERE id = $1", [id]);
  return corsJson({ ok: true, deleted: p.code });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const code = cleanCode(body.code);
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (code.length < 2) return corsError("Provider code must be at least 2 characters (A–Z, 0–9, _)", 400);
  if (!name) return corsError("Provider name is required", 400);

  const dup = await query("SELECT 1 FROM game_providers WHERE code = $1", [code]);
  if (dup.length) return corsError("A provider with that code already exists", 409);

  const apiBaseUrl = String(body.api_base_url ?? "").trim();
  if (apiBaseUrl && !/^https:\/\//i.test(apiBaseUrl)) return corsError("API base URL must start with https://", 400);

  const category = String(body.default_category ?? "SLOTS").toUpperCase();
  if (!(GAME_CATEGORIES as readonly string[]).includes(category)) return corsError("unknown default category", 400);

  const authType = String(body.auth_type ?? "hmac").toLowerCase();
  if (!AUTH_TYPES.has(authType)) return corsError("auth_type must be hmac, bearer, basic or query", 400);

  const logo = String(body.logo_url ?? "").trim() === "" ? "" : sanitizeImageUrl(String(body.logo_url));
  if (logo === null) return corsError("invalid logo image", 400);

  let cfg: Record<string, string>;
  let secret = "";
  let keyId = "";
  try {
    const split = splitSecrets(cleanApiConfig(body.api_config));
    cfg = split.rest; secret = split.key; keyId = split.keyId;
  } catch (e) {
    return corsError((e as Error).message, 400);
  }

  const [row] = await query(
    `INSERT INTO game_providers
       (code, name, logo_url, api_base_url, api_config, auth_type, sync_path, launch_path, default_category, is_active)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,TRUE)
     RETURNING id, code`,
    [
      code, name, logo ?? "", apiBaseUrl.slice(0, 256),
      JSON.stringify(cfg),
      authType,
      String(body.sync_path ?? "").trim().slice(0, 128),
      String(body.launch_path ?? "").trim().slice(0, 128),
      category,
    ]
  );
  if (secret || keyId) {
    try { await storeProviderSecrets(code, secret, keyId); }
    catch (e) { return corsError((e as Error).message, 400); }
  }

  return corsJson({
    ok: true,
    provider: { ...row, id: Number(row.id) },
    secrets_saved: Boolean(secret || keyId),
    note: secret || keyId ? "Credentials stored encrypted server-side — ready for live calls." : "No credentials yet: set a Secret key to enable live calls.",
  });
}
