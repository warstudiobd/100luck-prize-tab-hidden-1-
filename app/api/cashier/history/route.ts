/**
 * Player cashier history — the "আজ / গতকাল / ৭ দিন" filter used by the
 * withdrawal-records screen.
 *
 *   ?type=DEPOSIT|WITHDRAW|all   (default all)
 *   ?range=today|yesterday|7d|all (default all)  — days are Asia/Dhaka days
 *   ?status=APPROVED|PENDING|REJECTED|PAID       (optional)
 *
 * Only the signed-in player's own rows are ever returned.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
export const dynamic = "force-dynamic";

const RANGE_SQL: Record<string, string> = {
  today: `(created_at AT TIME ZONE 'Asia/Dhaka')::date = (now() AT TIME ZONE 'Asia/Dhaka')::date`,
  yesterday: `(created_at AT TIME ZONE 'Asia/Dhaka')::date = ((now() AT TIME ZONE 'Asia/Dhaka')::date - 1)`,
  "7d": `created_at >= ((now() AT TIME ZONE 'Asia/Dhaka')::date - 6)::timestamp AT TIME ZONE 'Asia/Dhaka'`,
};

export async function GET(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const type = params.get("type")?.toUpperCase();
  const range = (params.get("range") || "all").toLowerCase();
  const status = params.get("status")?.toUpperCase();

  const values: any[] = [sess.sub];
  let where = "user_id = $1";
  if (type === "DEPOSIT" || type === "WITHDRAW") { values.push(type); where += ` AND request_type = $${values.length}`; }
  if (status === "APPROVED" || status === "PENDING" || status === "REJECTED" || status === "PAID") { values.push(status); where += ` AND status = $${values.length}`; }
  if (RANGE_SQL[range]) where += ` AND ${RANGE_SQL[range]}`;

  const rows = await query(
    `SELECT * FROM cashier_requests WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
    values
  );

  return NextResponse.json({
    ok: true,
    range,
    requests: rows.map(r => ({ ...r, id: Number(r.id), amount_cents: Number(r.amount_cents) })),
  });
}
