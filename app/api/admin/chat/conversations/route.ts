/** Admin live chat — conversation list with last message preview and unread counters. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("status") || "open").trim().toLowerCase();
  const where = filter === "all" ? "" : filter === "closed" ? "WHERE c.status = 'closed'" : "WHERE c.status = 'open'";

  // One row per conversation with a usable preview: last sender, whether the
  // message was the bot's auto-reply or carried a picture, plus its age.
  const rows = await query(
    `SELECT c.id, c.status, c.user_id, c.created_at, c.last_message_at,
            c.unread_admin, c.unread_user,
            u.username_or_phone, u.phone,
            lm.body   AS last_message,
            lm.sender AS last_sender,
            lm.image_url AS last_image_url,
            lm.is_auto   AS last_is_auto,
            lm.created_at AS last_created_at
     FROM chat_conversations c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN LATERAL (
       SELECT body, sender, image_url, is_auto, created_at
       FROM chat_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.id DESC
       LIMIT 1
     ) lm ON TRUE
     ${where}
     ORDER BY c.last_message_at DESC
     LIMIT 100`,
    []
  );

  const [sum] = await query(
    "SELECT COALESCE(SUM(unread_admin), 0)::int AS n FROM chat_conversations WHERE status = 'open'"
  );

  return corsJson({
    ok: true,
    unread_total: sum?.n ?? 0,
    conversations: rows.map((r: any) => ({
      ...r,
      id: Number(r.id),
      user_id: Number(r.user_id),
      last_message: r.last_message ?? null,
      last_sender: r.last_sender ?? null,
      last_image_url: r.last_image_url || "",
      last_is_auto: Boolean(r.last_is_auto),
      last_created_at: r.last_created_at ?? null,
    })),
  });
}
