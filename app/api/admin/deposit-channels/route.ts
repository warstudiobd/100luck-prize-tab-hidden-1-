/** Admin deposit/payout channels — list, create (new gateway), update, delete, reorder.
 *
 *  Channels are data, not code: an admin can add any payment company
 *  (name, logo, limits, manual account or API gateway) from the panel and it
 *  appears on the player's Deposit screen immediately.
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

const MAX_CHANNELS = 30;

/** Channel names are shown verbatim to players, so keep them short and tidy. */
function cleanChannelName(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function cleanApiConfig(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 48);
    if (!key) continue;
    const val = String(v ?? "").trim().slice(0, 128);
    if (val) out[key] = val;
  }
  return out;
}

function gatewayConfigured(): boolean {
  return Boolean(private_env("DEPOSIT_API_KEY") && private_env("DEPOSIT_API_SECRET"));
}

/** Reading env the way the gateway routes do (kept local to avoid a cycle). */
function private_env(k: string): string {
  return String(process.env[k] ?? "").trim();
}

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const rows = await query(
    `SELECT id, channel, account_label, account_number, reference,
            min_amount_cents, max_amount_cents, is_active, updated_at,
            mode, api_provider, api_base_url, api_config,
            COALESCE(display_order, 100) AS display_order,
            COALESCE(logo_url, '') AS logo_url,
            COALESCE(for_payout, TRUE) AS for_payout
     FROM deposit_channels
     ORDER BY display_order ASC, id ASC`
  );
  return corsJson({
    ok: true,
    gateway_configured: gatewayConfigured(),
    channels: rows.map((r: any) => ({ ...r, id: Number(r.id) })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const channel = cleanChannelName(body.channel);
  if (channel.length < 3) return corsError("Gateway name must be at least 3 characters", 400);
  if (channel.length > 16) return corsError("Gateway name must be 16 characters or fewer", 400);
  if (!/^[A-Za-z0-9 ._-]+$/.test(channel)) return corsError("Gateway name may use letters, numbers, spaces, dot, dash and underscore only", 400);

  const [{ n }] = await query("SELECT COUNT(*)::int AS n FROM deposit_channels");
  if (Number(n) >= MAX_CHANNELS) return corsError(`At most ${MAX_CHANNELS} gateways can be configured`, 400);

  const dup = await query("SELECT 1 FROM deposit_channels WHERE lower(channel) = lower($1)", [channel]);
  if (dup.length) return corsError("A gateway with that name already exists", 409);

  const minCents = Math.max(1, Math.trunc(Number(body.min_amount_cents ?? 10_000)));
  const maxCents = Math.max(minCents, Math.trunc(Number(body.max_amount_cents ?? 25_000_000)));
  const logo = sanitizeImageUrl(String(body.logo_url ?? "")) ?? "";
  const displayOrder = Math.trunc(Number(body.display_order ?? 100)) || 100;

  const [row] = await query(
    `INSERT INTO deposit_channels
       (channel, account_label, account_number, reference, min_amount_cents, max_amount_cents,
        is_active, mode, api_provider, api_base_url, api_config, display_order, logo_url, for_payout)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,'manual','','','{}'::jsonb,$7,$8,$9)
     RETURNING id, channel`,
    [
      channel,
      String(body.account_label ?? "Personal").trim().slice(0, 32) || "Personal",
      String(body.account_number ?? "").trim().slice(0, 64),
      String(body.reference ?? "").trim().slice(0, 64),
      minCents, maxCents, displayOrder, logo,
      body.for_payout === undefined ? true : Boolean(body.for_payout),
    ]
  );
  return corsJson({ ok: true, channel: { ...row, id: Number(row.id) } });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const channel = cleanChannelName(body.channel);
  if (!channel) return corsError("channel required", 400);

  const sets: string[] = [];
  const params: any[] = [];
  const push = (sqlFrag: string, value: unknown) => { params.push(value); sets.push(sqlFrag.replace("$$", `$${params.length}`)); };

  if (body.account_label !== undefined) push("account_label = $$", String(body.account_label).trim().slice(0, 32));
  if (body.account_number !== undefined) push("account_number = $$", String(body.account_number).trim().slice(0, 64));
  if (body.reference !== undefined) push("reference = $$", String(body.reference).trim().slice(0, 64));
  if (body.min_amount_cents !== undefined) push("min_amount_cents = $$", Math.max(1, Math.trunc(Number(body.min_amount_cents))));
  if (body.max_amount_cents !== undefined) push("max_amount_cents = $$", Math.max(1, Math.trunc(Number(body.max_amount_cents))));
  if (body.is_active !== undefined) push("is_active = $$", Boolean(body.is_active));
  if (body.for_payout !== undefined) push("for_payout = $$", Boolean(body.for_payout));
  if (body.display_order !== undefined) push("display_order = $$", Math.trunc(Number(body.display_order)) || 100);

  if (body.logo_url !== undefined) {
    const logo = String(body.logo_url ?? "").trim() === "" ? "" : sanitizeImageUrl(String(body.logo_url));
    if (logo === null) return corsError("invalid logo image (https URL or uploaded picture only)", 400);
    push("logo_url = $$", logo);
  }

  if (body.mode !== undefined) {
    const mode = String(body.mode).toLowerCase();
    if (mode !== "manual" && mode !== "api") return corsError("mode must be manual or api", 400);
    push("mode = $$", mode);
  }
  if (body.api_provider !== undefined) {
    const provider = String(body.api_provider).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    push("api_provider = $$", provider);
  }
  if (body.api_base_url !== undefined) {
    const url = String(body.api_base_url).trim();
    if (url && !/^https:\/\//i.test(url)) return corsError("API base URL must start with https://", 400);
    push("api_base_url = $$", url.slice(0, 256));
  }
  if (body.api_config !== undefined) push("api_config = $$", JSON.stringify(cleanApiConfig(body.api_config)));

  if (!sets.length) return corsError("nothing to update", 400);

  params.push(channel);
  const rows = await query(
    `UPDATE deposit_channels SET ${sets.join(", ")}, updated_at = now()
      WHERE channel = $${params.length} RETURNING id, channel`,
    params
  );
  if (!rows.length) return corsError("channel not found", 404);
  return corsJson({ ok: true, channel: { ...rows[0], id: Number(rows[0].id) } });
}

export async function DELETE(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const channel = cleanChannelName(searchParams.get("channel"));
  if (!channel) return corsError("channel required", 400);

  // Never delete a gateway that players have history on — hide it instead.
  const [{ n }] = await query("SELECT COUNT(*)::int AS n FROM cashier_requests WHERE channel = $1", [channel]);
  if (Number(n) > 0) {
    return corsError("This gateway has past transactions — turn it off instead of deleting it", 409);
  }
  const rows = await query("DELETE FROM deposit_channels WHERE channel = $1 RETURNING id", [channel]);
  if (!rows.length) return corsError("channel not found", 404);
  return corsJson({ ok: true, deleted: channel });
}
