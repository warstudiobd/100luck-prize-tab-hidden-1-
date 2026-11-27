/**
 * QR image generator — GET /api/qr?d=<text>&s=<px>
 *
 * Used by the referral share sheet (and anything else that needs a scannable
 * code). Generated on the server with the battle-tested `qrcode` package so the
 * browser never needs a QR dependency and nothing leaks to a third-party QR
 * service. Text is capped at 300 chars — plenty for a referral URL.
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("d") ?? "").slice(0, 300);
  if (!text) return NextResponse.json({ ok: false, error: "missing d" }, { status: 400 });
  const size = Math.min(720, Math.max(90, Number(req.nextUrl.searchParams.get("s")) || 320));

  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#101010ff", light: "#ffffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600",
    },
  });
}
