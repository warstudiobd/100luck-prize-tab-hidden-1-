/**
 * Admin — physical prize queue for the festival wheel (v51).
 *
 *   GET  /api/admin/prizes          every unclaimed iPhone win (operator must hand
 *                                   it over by hand), plus the cash paid out today.
 *   POST /api/admin/prizes { id, action: "settle" | "void", note? }
 *
 * A physical win credits nothing in cash — settling it only records that the
 * operator delivered the phone. Voiding marks a fraudulent win. Both are audited
 * with the admin id, and neither touches a wallet.
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { maskName } from "@/lib/prize-wheel";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);

  const rows = await query(
    `SELECT w.id, w.user_id, w.prize_key, w.created_at,
            u.username_or_phone, u.phone, u.created_at AS joined_at
       FROM prize_wheel w JOIN users u ON u.id = w.user_id
      WHERE w.physical = true
      ORDER BY w.created_at DESC LIMIT 200`
  ).catch(() => [] as any[]);

  const cash = await query(
    `SELECT COUNT(*)::int AS plays, COALESCE(SUM(prize_cents),0)::bigint AS paid_cents,
            COALESCE(SUM(fee_cents),0)::bigint AS fees_cents
       FROM prize_wheel
      WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = (now() AT TIME ZONE 'Asia/Dhaka')::date`
  ).catch(() => [{ plays: 0, paid_cents: 0, fees_cents: 0 }] as any[]);

  const tickets = await query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(prize_cents),0)::bigint AS paid_cents
       FROM prize_tickets
      WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date = (now() AT TIME ZONE 'Asia/Dhaka')::date`
  ).catch(() => [{ n: 0, paid_cents: 0 }] as any[]);

  return corsJson({
    ok: true,
    physical: (rows as any[]).map(r => ({
      id: Number(r.id), user_id: Number(r.user_id),
      who: maskName(r.username_or_phone), phone: r.phone ?? null,
      joined_at: r.joined_at, won_at: r.created_at,
    })),
    cash_today: {
      plays: Number((cash as any[])[0]?.plays ?? 0),
      paid_cents: Number((cash as any[])[0]?.paid_cents ?? 0),
      fees_cents: Number((cash as any[])[0]?.fees_cents ?? 0),
    },
    tickets_today: {
      count: Number((tickets as any[])[0]?.n ?? 0),
      paid_cents: Number((tickets as any[])[0]?.paid_cents ?? 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);

  const body = await req.json().catch(() => ({}));
  const id = Math.trunc(Number(body.id ?? 0));
  const action = String(body.action ?? "");
  if (!id || (action !== "settle" && action !== "void")) {
    return corsError("id and action (settle|void) are required", 400);
  }

  // The queue is read-only history: settling or voiding just records the decision,
  // so a delivered phone can never be handed out twice.
  const upd = await query(
    `UPDATE prize_wheel SET physical = false, prize_key = $2
      WHERE id = $1 AND physical = true RETURNING id`,
    [id, action === "settle" ? "iphone_settled" : "iphone_void"]
  ).catch(() => [] as any[]);

  if (!(upd as any[]).length) return corsError("prize not found or already handled", 404);
  console.log(`[admin/prizes] admin=${auth.admin.id ?? "?"} prize=${id} action=${action} note=${String(body.note ?? "").slice(0, 200)}`);
  return corsJson({ ok: true, id, action });
}
