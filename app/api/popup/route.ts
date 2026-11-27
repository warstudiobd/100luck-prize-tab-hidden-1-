/** Public: the single latest ACTIVE site popup shown on website open. */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
      "SELECT id, title_en, title_bn, body_en, body_bn, image_url, updated_at FROM site_popups WHERE is_active = TRUE ORDER BY updated_at DESC, id DESC LIMIT 1"
    );
    const p = rows[0];
    return NextResponse.json({ ok: true, popup: p ? {
      id: Number(p.id),
      title_en: p.title_en, title_bn: p.title_bn,
      body_en: p.body_en, body_bn: p.body_bn,
      image_url: p.image_url || "",
    } : null });
  } catch {
    return NextResponse.json({ ok: true, popup: null });
  }
}
