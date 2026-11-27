/** Dashboard summary for the admin panel. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const [users] = await query(
    "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_blocked)::int AS blocked, COUNT(*) FILTER (WHERE is_admin)::int AS admins FROM users"
  );
  const pending = await query(
    `SELECT request_type, COUNT(*)::int AS n, COALESCE(SUM(amount_cents),0)::bigint AS total
     FROM cashier_requests WHERE status = 'PENDING' GROUP BY request_type`
  );
  const dep = pending.find(p => p.request_type === "DEPOSIT");
  const wd  = pending.find(p => p.request_type === "WITHDRAW");
  const [complaints] = await query(
    "SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open, COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress FROM complaints"
  );
  const [games] = await query(
    "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE is_hot)::int AS hot FROM games_catalog"
  );
  const [ann] = await query("SELECT COUNT(*) FILTER (WHERE is_active)::int AS active FROM announcements");

  return corsJson({
    ok: true,
    users: { total: users.total, blocked: users.blocked, admins: users.admins },
    pending: {
      deposits:  { count: dep?.n ?? 0, total_cents: String(dep?.total ?? 0) },
      withdrawals: { count: wd?.n ?? 0, total_cents: String(wd?.total ?? 0) },
    },
    complaints: { open: complaints.open, in_progress: complaints.in_progress },
    games: { total: games.total, active: games.active, hot: games.hot },
    announcements: { active: ann.active },
  });
}
