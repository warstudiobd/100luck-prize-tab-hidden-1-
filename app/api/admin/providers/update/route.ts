/** Admin game-provider edit — rename, repoint the API, toggle, recategorise. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";
import { GAME_CATEGORIES } from "@/lib/types";
import { PROVIDER_SECRET_RE, PROVIDER_KEYID_RE, storeProviderSecrets } from "@/lib/provider-auth";

export const dynamic = "force-dynamic";

const AUTH_TYPES = new Set(["hmac", "bearer", "basic", "query"]);

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.id));
  if (!Number.isFinite(id) || id <= 0) return corsError("id required", 400);

  const [existing] = await query("SELECT id, code FROM game_providers WHERE id = $1", [id]);
  if (!existing) return corsError("provider not found", 404);

  const sets: string[] = [];
  const params: any[] = [];
  const push = (frag: string, value: unknown) => { params.push(value); sets.push(frag.replace("$$", `$${params.length}`)); };

  if (body.code !== undefined) {
    const nextCode = String(body.code).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 32).replace(/^_|_$/g, "");
    if (nextCode.length < 2) return corsError("Provider code must be at least 2 characters", 400);
    if (nextCode !== existing.code) {
      const dup = await query("SELECT 1 FROM game_providers WHERE code = $1", [nextCode]);
      if (dup.length) return corsError("A provider with that code already exists", 409);
      push("code = $$", nextCode);
    }
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) return corsError("name cannot be empty", 400);
    push("name = $$", name);
  }
  if (body.logo_url !== undefined) {
    const raw = String(body.logo_url ?? "").trim();
    const logo = raw === "" ? "" : sanitizeImageUrl(raw);
    if (logo === null) return corsError("invalid logo image", 400);
    push("logo_url = $$", logo);
  }
  if (body.api_base_url !== undefined) {
    const url = String(body.api_base_url).trim();
    if (url && !/^https:\/\//i.test(url)) return corsError("API base URL must start with https://", 400);
    push("api_base_url = $$", url.slice(0, 256));
  }
  let newSecret = "";
  let newKeyId = "";
  if (body.api_config !== undefined) {
    const cfg: Record<string, string> = {};
    if (body.api_config && typeof body.api_config === "object") {
      for (const [k, v] of Object.entries(body.api_config as Record<string, unknown>)) {
        const key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 48);
        const val = String(v ?? "").trim().slice(0, 160);
        if (key && val) cfg[key] = val;
      }
    }
    newSecret = cfg.key ?? "";
    newKeyId = cfg.key_id ?? "";
    delete cfg.key;
    delete cfg.key_id;
    if (newSecret && !PROVIDER_SECRET_RE.test(newSecret)) return corsError("Secret key must be 16–200 characters", 400);
    if (newKeyId && !PROVIDER_KEYID_RE.test(newKeyId)) return corsError("Invalid key id / agent token", 400);
    push("api_config = $$::jsonb", JSON.stringify(cfg));
  }
  if (body.auth_type !== undefined) {
    const authType = String(body.auth_type).toLowerCase();
    if (!AUTH_TYPES.has(authType)) return corsError("auth_type must be hmac, bearer, basic or query", 400);
    push("auth_type = $$", authType);
  }
  if (body.sync_path !== undefined) push("sync_path = $$", String(body.sync_path).trim().slice(0, 128));
  if (body.launch_path !== undefined) push("launch_path = $$", String(body.launch_path).trim().slice(0, 128));
  if (body.default_category !== undefined) {
    const category = String(body.default_category).toUpperCase();
    if (!(GAME_CATEGORIES as readonly string[]).includes(category)) return corsError("unknown category", 400);
    push("default_category = $$", category);
  }
  if (body.is_active !== undefined) push("is_active = $$", Boolean(body.is_active));

  if (!sets.length) return corsError("nothing to update", 400);

  params.push(id);
  const [row] = await query(
    `UPDATE game_providers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING id, code`,
    params
  );
  if (newSecret || newKeyId) {
    try { await storeProviderSecrets(String(row.code), newSecret, newKeyId, { merge: true }); }
    catch (e) { return corsError((e as Error).message, 400); }
  }

  return corsJson({
    ok: true,
    provider: { ...row, id: Number(row.id) },
    secrets_saved: Boolean(newSecret || newKeyId),
  });
}
