/** Public list of cashier channels (admin-managed).
 *
 *  ?for=deposit  (default) → rows the player can actually pay INTO: active gateways such
 *                as PayWise plus any manual wallet the operator really entered.
 *  ?for=withdraw           → payout rails. These are intentionally different rows: a
 *                withdraw channel is "the operator pays this wallet by hand", so it has
 *                no deposit number (account_number = '') and is normally inactive for
 *                deposits. Filtering by for_payout keeps the two lists from polluting
 *                each other — before this, adding a payout wallet opened a fake deposit
 *                row and the withdrawal tabs never showed it.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { bankCodeFor, isConfigured as paywiseConfigured } from "@/lib/paywise";

/** Which wallets a gateway channel can actually be paid with, judged server-side. */
function methodsFor(cfg: Record<string, any>): { methods: string[]; source: string } {
  const configured = ["bKash", "Nagad", "Rocket", "Upay"].filter(m => {
    const key = `${m.toLowerCase()}_url`;
    return String(cfg?.[key] ?? "").trim() !== "";
  });
  if (configured.length) return { methods: configured, source: "method_url" };
  if (String(cfg?.gateway_url ?? "").trim() || String(cfg?.checkout_url ?? "").trim()) {
    return { methods: ["bKash", "Nagad", "Rocket"], source: "template" };
  }
  if (paywiseConfigured()) {
    // Only the rails PayWise really has for BDT. A picker that offers Rocket when
    // PayWise has no Rocket rail is exactly the dead end this rewrite removes.
    return { methods: ["bKash", "Nagad", "Upay"].filter(m => bankCodeFor(m)), source: "paywise_api" };
  }
  return { methods: [], source: "none" };
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const forPayout = String(new URL(req.url).searchParams.get("for") ?? "") === "withdraw";
  try {
    const rows = await query(
      `SELECT channel, account_label, account_number, reference,
              min_amount_cents, max_amount_cents, mode, api_provider,
              COALESCE(display_order, 100) AS display_order,
              COALESCE(logo_url, '') AS logo_url,
              COALESCE(for_payout, TRUE) AS for_payout,
              COALESCE(api_config, '{}'::jsonb) AS api_config
         FROM deposit_channels
        WHERE ${forPayout
          // A collection gateway can never be a payout rail: the operator pays these by
          // hand from their own wallet, so only manual rows are offered.
          ? "COALESCE(for_payout, TRUE) = TRUE AND COALESCE(mode, 'manual') <> 'api' AND COALESCE(api_provider, '') = ''"
          : "is_active = TRUE"}
        ORDER BY (api_provider = 'paywise') DESC, display_order ASC, id ASC`
    );
    return NextResponse.json({
      ok: true,
      channels: rows.map(r => ({
        ...r,
        min_amount_cents: Number(r.min_amount_cents),
        max_amount_cents: Number(r.max_amount_cents),
        display_order: Number(r.display_order),
        for_payout: Boolean(r.for_payout),
        // Only the two player-facing fields ever leave the server; merchant ids and
        // any secret in api_config stay here.
        checkout_url: String((r.api_config as any)?.checkout_url ?? ""),
        qr_url: String((r.api_config as any)?.qr_url ?? ""),
        // Gateway URL template for the player's chosen method, plus per-method overrides.
        gateway_url: String((r.api_config as any)?.gateway_url ?? ""),
        method_urls: {
          bKash: String((r.api_config as any)?.bkash_url ?? ""),
          Nagad: String((r.api_config as any)?.nagad_url ?? ""),
          Rocket: String((r.api_config as any)?.rocket_url ?? ""),
          Upay: String((r.api_config as any)?.upay_url ?? ""),
        },
        // What the player may pick inside this gateway, and why.
        ...methodsFor((r.api_config ?? {}) as Record<string, any>),
      })),
    });
  } catch {
    // Table missing or DB hiccup → client falls back to built-in defaults
    return NextResponse.json({ ok: true, channels: [] });
  }
}
