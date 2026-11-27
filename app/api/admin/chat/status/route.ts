/** Admin live chat — close or reopen a conversation. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const conversationId = Math.trunc(Number(body.conversation_id));
  const status = String(body.status ?? "").trim().toLowerCase();
  if (!Number.isFinite(conversationId) || conversationId <= 0) return corsError("conversation_id required", 400);
  if (status !== "open" && status !== "closed") return corsError("status must be 'open' or 'closed'", 400);

  const rows = await query(
    "UPDATE chat_conversations SET status = $1, updated_at = now() WHERE id = $2 RETURNING id",
    [status, conversationId]
  );
  if (!rows[0]) return corsError("conversation not found", 404);

  return corsJson({ ok: true, conversation_id: conversationId, status });
}
