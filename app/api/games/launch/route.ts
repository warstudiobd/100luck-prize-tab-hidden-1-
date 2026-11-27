import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { isDemoMode, providerPasswordFor, softaggregator } from "@/lib/softaggregator";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSessionUserId();
  const body = await req.json().catch(() => ({}));
  const gameCode = String(body.game_code ?? body.gameid ?? "").trim();
  // mode="trial" → free play-for-fun launch. It never touches a wallet, so guests
  // may try it too; only real-money launches require a signed-in player.
  const wantTrial = String(body.mode ?? "").toLowerCase() === "trial";
  if (!sess && !wantTrial) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!gameCode) return NextResponse.json({ ok: false, error: "game_code is required" }, { status: 400 });

  const games = await query("SELECT * FROM games_catalog WHERE game_code = $1", [gameCode]);
  const game = games[0];
  if (!game) return NextResponse.json({ ok: false, error: "unknown game" }, { status: 404 });

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, launch_url: `/play/demo?game=${encodeURIComponent(game.game_code)}&title=${encodeURIComponent(game.title_bn || game.title || "")}`, demo: true, game: { game_code: game.game_code, title: game.title, provider_code: game.provider_code } });
  }

  const rows = sess
    ? await query("SELECT id, username_or_phone, currency, phone, is_blocked, provider_ready FROM users WHERE id = $1", [sess.sub])
    : [];
  const u = rows[0] as { id: number; username_or_phone: string; currency: string | null; phone: string | null; is_blocked: boolean; provider_ready: boolean } | undefined;
  if (sess && !u) return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  if (u?.is_blocked) return NextResponse.json({ ok: false, error: "account_blocked", message: "এই অ্যাকাউন্টটি ব্লক করা হয়েছে / This account has been blocked" }, { status: 403 });

  // ── Free trial (play for fun) ────────────────────────────────────────────
  // Uses the provider's demo launch. It never touches the player's wallet or
  // balance, so it deliberately skips the phone requirement that real-money
  // launches need.
  if (wantTrial) {
    const trialLang = String(body.lang ?? "").toLowerCase() === "en" ? "en" : "bn";
    const guest = { id: 0, username_or_phone: "guest_trial" };
    const who = u ? { id: Number(u.id), username_or_phone: u.username_or_phone } : guest;
    const demoRes = await softaggregator.getGame({
      username: who.username_or_phone,
      password: providerPasswordFor(who),
      gameid: game.game_code,
      lang: trialLang,
      currency: String(u?.currency || "BDT").toUpperCase(),
      device: "mobile",
      playForFun: true,
    });
    if (!demoRes.ok) {
      // Provider has no demo for this title → fall back to our own free-play game so
      // the Free Trial button is never a dead end (and never touches the wallet).
      return NextResponse.json({
        ok: true,
        launch_url: `/play/demo?game=${encodeURIComponent(game.game_code)}&title=${encodeURIComponent(game.title_bn || game.title || "")}`,
        demo: true,
        mode: "trial",
        fallback: true,
        game: { game_code: game.game_code, title: game.title, provider_code: game.provider_code },
      });
    }
    return NextResponse.json({ ok: true, launch_url: demoRes.url, demo: true, mode: "trial", game: { game_code: game.game_code, title: game.title, provider_code: game.provider_code } });
  }

  // Past this point the launch is real money, which needs a signed-in player row.
  if (!u || !sess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!u.phone) {
    return NextResponse.json({
      ok: false,
      error: "PLAYER_PHONE_REQUIRED",
      message: "SoftAggregator requires your phone number before a real-money game can launch. Add it in Member → Game launch profile.",
    }, { status: 428 });
  }
  // The site no longer collects emails. SoftAggregator requires an email on createPlayer,
  // so the provider gets a deterministic no-reply address; players never see or type one.
  const providerEmail = `player${u.id}@warstudio.site`;

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "production" ? "https://warstudio.site" : "http://localhost:3000");
  // Portrait-first: always request the provider's mobile/vertical layout so games
  // render upright in the phone-sized frame instead of a rotated landscape scene.
  const device: "mobile" | "desktop" = "mobile";
  // Language for the provider game: explicit UI selection wins over the browser header.
  const requestedLang = String(body.lang ?? "").toLowerCase();
  const acceptLang = req.headers.get("accept-language") || "";
  const lang = requestedLang === "bn" || requestedLang === "en"
    ? requestedLang
    : (/\bbn\b|\bbang\b/i.test(acceptLang) ? "bn" : "en");
  const currency = String(u.currency || "BDT").toUpperCase();
  const password = providerPasswordFor({ id: Number(u.id), username_or_phone: u.username_or_phone });

  // ── Provider onboarding happens ONCE per player, not on every launch ─────
  // createPlayer + getGame were two sequential round-trips to SoftAggregator, so
  // every single game tap paid ~1.5 s before the game even started. The account
  // only has to exist once, so we remember it on the user row and skip the call
  // afterwards. First launch pays for both; every later launch pays for one.
  if (!u.provider_ready) {
    const created = await softaggregator.createPlayer({ username: u.username_or_phone, password, currency, email: providerEmail, phone: u.phone });
    if (!created.ok) return NextResponse.json({ ok: false, error: created.error || "provider createPlayer failed" }, { status: 502 });
    // Best-effort: a failure here only costs one extra createPlayer call later.
    await query("UPDATE users SET provider_ready = true WHERE id = $1", [u.id]).catch(() => {});
  }

  const launch = await softaggregator.getGame({
    username: u.username_or_phone,
    password,
    gameid: game.game_code,
    lang,
    currency,
    email: providerEmail,
    phone: u.phone,
    country: "BD",
    homeurl: origin,
    device,
  });
  if (!launch.ok) return NextResponse.json({ ok: false, error: launch.error }, { status: 502 });
  return NextResponse.json({ ok: true, launch_url: launch.url, demo: false, mode: "real", game: { game_code: game.game_code, title: game.title, provider_code: game.provider_code } });
}
