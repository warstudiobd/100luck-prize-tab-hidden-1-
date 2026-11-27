/** Legacy paid Lucky Spin endpoint retired. All wheel spins use the free,
 * deposit-earned /api/prizes/spin flow; this endpoint must never charge money. */
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST() {
  return NextResponse.json({
    ok: false,
    code: "legacy_spin_retired",
    error: "Paid spins are disabled. Use the free Lucky Wheel earned from a successful deposit of ৳500 or more.",
  }, { status: 410 });
}
