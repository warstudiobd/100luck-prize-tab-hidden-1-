/** Player live chat — poll state (GET) and post a message (POST). Auth required.
 *  One open conversation per user (partial unique index). Polling model: GET marks admin replies as read. */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { sanitizeImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

const MAX_BODY = 2000;

type ConvRow = { id: string | number; status: string };

async function currentState(userId: number, markAdminRead: boolean) {
  // Prefer the open conversation; otherwise show the most recent one (read-only history)
  const open = (await query(
    "SELECT id, status FROM chat_conversations WHERE user_id = $1 AND status = 'open' ORDER BY id DESC LIMIT 1",
    [userId]
  ))[0] as ConvRow | undefined;
  const latest = open ?? ((await query(
    "SELECT id, status FROM chat_conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId]
  ))[0] as ConvRow | undefined);

  if (!latest) return { ok: true, conversation: null, messages: [], unread_user: 0 };

  const convId = Number(latest.id);
  if (markAdminRead && open) {
    await query("UPDATE chat_conversations SET unread_user = 0 WHERE id = $1", [convId]);
  }
  const messages = await query(
    "SELECT id, sender, body, image_url, is_auto, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC LIMIT 500",
    [convId]
  );
  return {
    ok: true,
    conversation: { id: convId, status: latest.status },
    messages: messages.map((m: any) => ({
      id: Number(m.id), sender: m.sender, body: m.body,
      image_url: m.image_url || "", is_auto: Boolean(m.is_auto), created_at: m.created_at,
    })),
    unread_user: 0,
  };
}

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await currentState(Number(sess.sub), true));
}

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (text.length > MAX_BODY) return NextResponse.json({ ok: false, error: `message too long (max ${MAX_BODY})` }, { status: 400 });

  // Optional picture (payment slip, screenshot). Accepts an https URL or a
  // client-downscaled JPEG data URI; anything else is rejected outright.
  let imageUrl = "";
  if (body.image_url != null && String(body.image_url).trim() !== "") {
    const clean = sanitizeImageUrl(String(body.image_url));
    if (!clean) return NextResponse.json({ ok: false, error: "invalid picture" }, { status: 400 });
    imageUrl = clean;
  }
  if (text.length < 1 && !imageUrl) return NextResponse.json({ ok: false, error: "empty message" }, { status: 400 });

  const u = await query("SELECT is_blocked FROM users WHERE id = $1", [sess.sub]);
  if (u[0]?.is_blocked) return NextResponse.json({ ok: false, error: "account blocked" }, { status: 403 });

  // Single continuous support thread per player: reuse the latest conversation,
  // reopening it if the agent closed it (player's new message reopens the chat).
  let convId: number;
  const latest = (await query(
    "SELECT id, status FROM chat_conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [sess.sub]
  ))[0] as ConvRow | undefined;
  if (latest) {
    convId = Number(latest.id);
    if (latest.status === "closed") {
      await query("UPDATE chat_conversations SET status = 'open', updated_at = now() WHERE id = $1 AND status = 'closed'", [convId]);
    }
  } else {
    try {
      const c = (await query("INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id", [sess.sub]))[0] as ConvRow;
      convId = Number(c.id);
    } catch (e: any) {
      if (e?.code === "23505") {
        const c = (await query("SELECT id FROM chat_conversations WHERE user_id = $1 AND status = 'open' LIMIT 1", [sess.sub]))[0] as ConvRow;
        convId = Number(c.id);
      } else throw e;
    }
  }
  await query(
    "INSERT INTO chat_messages (conversation_id, sender, body, image_url) VALUES ($1, 'user', $2, $3)",
    [convId, text, imageUrl]
  );
  await query(
    "UPDATE chat_conversations SET unread_admin = unread_admin + 1, last_message_at = now(), updated_at = now() WHERE id = $1",
    [convId]
  );

  // Auto-reply: when delegated to the bot, send the configured reply if no agent
  // has spoken in the last 6 hours. Admin manual replies always win.
  try {
    const ar = (await query("SELECT is_enabled, body FROM chat_auto_reply WHERE id = 1"))[0] as any;
    if (ar?.is_enabled && String(ar.body ?? "").trim()) {
      const lastAgent = (await query(
        "SELECT created_at FROM chat_messages WHERE conversation_id = $1 AND sender = 'admin' ORDER BY id DESC LIMIT 1",
        [convId]
      ))[0] as any;
      const agentActive = lastAgent && (Date.now() - new Date(lastAgent.created_at).getTime()) < 6 * 3600 * 1000;
      if (!agentActive) {
        await query(
          "INSERT INTO chat_messages (conversation_id, sender, body, is_auto) VALUES ($1, 'admin', $2, TRUE)",
          [convId, String(ar.body).trim().slice(0, 2000)]
        );
        await query(
          "UPDATE chat_conversations SET unread_user = unread_user + 1, last_message_at = now(), updated_at = now() WHERE id = $1",
          [convId]
        );
      }
    }
  } catch (e) {
    console.error("[chat] auto-reply failed", e); // never block the player's message
  }

  return NextResponse.json(await currentState(Number(sess.sub), false));
}
