/** Public list of active announcements (announcement marquee). No auth required. */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
      "SELECT id, text_en, text_bn, image_url FROM announcements WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC LIMIT 20"
    );
    return NextResponse.json({ ok: true, announcements: rows.map(r => ({ ...r, id: Number(r.id) })) });
  } catch {
    // Table missing or DB hiccup → client falls back to built-in defaults
    return NextResponse.json({ ok: true, announcements: [] });
  }
}
