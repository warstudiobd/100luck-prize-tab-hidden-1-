/** Admin live chat — agent reply. Reopens the conversation if it was closed. */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";
import { sanitizeImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

const MAX_BODY = 2000;

export async function OPTIONS() { return corsPreflight(); }

export async function POST(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const conversationId = Math.trunc(Number(body.conversation_id));
  const text = String(body.body ?? "").trim();
  if (!Number.isFinite(conversationId) || conversationId <= 0) return corsError("conversation_id required", 400);
  if (text.length > MAX_BODY) return corsError(`message too long (max ${MAX_BODY})`, 400);

  // Optional picture attachment (https URL or downscaled JPEG data URI).
  let imageUrl = "";
  if (body.image_url != null && String(body.image_url).trim() !== "") {
    const clean = sanitizeImageUrl(String(body.image_url));
    if (!clean) return corsError("invalid picture", 400);
    imageUrl = clean;
  }
  if (text.length < 1 && !imageUrl) return corsError("empty message", 400);

  const conv = (await query("SELECT id FROM chat_conversations WHERE id = $1 LIMIT 1", [conversationId]))[0];
  if (!conv) return corsError("conversation not found", 404);

  await query(
    "INSERT INTO chat_messages (conversation_id, sender, body, image_url) VALUES ($1, 'admin', $2, $3)",
    [conversationId, text, imageUrl]
  );
  await query(
    "UPDATE chat_conversations SET unread_user = unread_user + 1, last_message_at = now(), updated_at = now(), status = 'open' WHERE id = $1",
    [conversationId]
  );

  return corsJson({ ok: true });
}
