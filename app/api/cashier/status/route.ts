/** Cashier status for the signed-in player: turnover rule + live progress.
 *  `ok` is the request envelope; `requirement.ok` is whether the player may
 *  withdraw right now — keep them separate so the two can never collide. */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getSetting, getWithdrawRequirement, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getSessionUserId();
  if (!sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [requirement, notice] = await Promise.all([
    getWithdrawRequirement(Number(sess.sub)),
    getSetting(SETTING_KEYS.withdrawNotice, ""),
  ]);
  return NextResponse.json({ ok: true, requirement: { ...requirement, notice } });
}
