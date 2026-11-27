/** Admin live chat — full thread of one conversation; marks agent unread counter as read. */
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
  const conversationId = Math.trunc(Number(searchParams.get("conversation_id")));
  if (!Number.isFinite(conversationId) || conversationId <= 0) return corsError("conversation_id required", 400);

  const conv = (await query(
    `SELECT c.id, c.status, c.user_id, c.created_at, c.last_message_at,
            u.username_or_phone, u.phone
     FROM chat_conversations c JOIN users u ON u.id = c.user_id WHERE c.id = $1 LIMIT 1`,
    [conversationId]
  ))[0];
  if (!conv) return corsError("conversation not found", 404);

  await query("UPDATE chat_conversations SET unread_admin = 0 WHERE id = $1", [conversationId]);

  const messages = await query(
    "SELECT id, sender, body, image_url, is_auto, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC LIMIT 500",
    [conversationId]
  );

  return corsJson({
    ok: true,
    conversation: { ...conv, id: Number(conv.id), user_id: Number(conv.user_id) },
    messages: messages.map((m: any) => ({
      id: Number(m.id), sender: m.sender, body: m.body,
      image_url: m.image_url || "", is_auto: Boolean(m.is_auto), created_at: m.created_at,
    })),
  });
}
