/**
 * Where each screen of the site lives as a real URL.
 *
 * The lobby used to be one page with `?tab=…`, so the browser's Back button walked
 * through a single entry and the tabs were not links: nothing could be shared,
 * bookmarked, opened in a new tab or reached from another page by URL.
 *
 * Every tab and every cashier sub-screen is now its own route. This module is the one
 * place that maps route → tab and back, and it is intentionally free of React so both
 * the server shell and the client tab bar can use it.
 */
export type TabKey = "home" | "deposit" | "promo" | "withdraw" | "member" | "prizes" | "app";

/**
 * Prize-centre sub-screens (v51). They live under /prizes/*, so the prize tab is
 * lit while any of them is open and the floating prize dock keeps working.
 */
export type PrizeSub = "spin" | "envelope" | "egg";

/** Cashier sub-pages: the withdraw tab owns two deeper screens. */
export type CashierSub = "bind" | "records";

/** Member sub-screens: the support section has its own URL (v52). */
export type MemberSub = "support";

export const TAB_PATHS: Record<TabKey, string> = {
  home: "/",
  deposit: "/deposit",
  promo: "/promotion",
  withdraw: "/withdraw",
  member: "/member",
  prizes: "/prizes",
  /* public app download — visible to everyone, signed in or not */
  app: "/get-app",
};

export const PRIZE_PATHS: Record<PrizeSub, string> = {
  spin: "/prizes/spin",
  envelope: "/prizes/envelope",
  egg: "/prizes/egg",
};

export function pathForPrize(sub: PrizeSub): string {
  return PRIZE_PATHS[sub];
}

export const MEMBER_PATHS: Record<MemberSub, string> = {
  support: "/member/support",
};

export function pathForMember(sub: MemberSub): string {
  return MEMBER_PATHS[sub];
}

export const SUB_PATHS: Record<CashierSub, string> = {
  bind: "/withdraw/bind",
  records: "/withdraw/records",
};

/** Old `?tab=` links (and /m/* redirects) still have to land on the right screen. */
export const LEGACY_TAB_QUERY: Record<string, TabKey> = {
  home: "home",
  app: "app",
  apk: "app",
  download: "app",
  deposit: "deposit",
  promo: "promo",
  promotion: "promo",
  withdraw: "withdraw",
  member: "member",
};

export function pathForTab(tab: TabKey): string {
  return TAB_PATHS[tab] ?? "/";
}

export function pathForSub(sub: CashierSub): string {
  return SUB_PATHS[sub];
}

/** Which tab a pathname belongs to (longest prefix wins so /withdraw/bind = withdraw). */
export function tabFromPath(pathname: string): TabKey {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "") return "home";
  if (clean.startsWith("/deposit")) return "deposit";
  if (clean.startsWith("/promotion") || clean.startsWith("/promo")) return "promo";
  if (clean.startsWith("/withdraw")) return "withdraw";
  if (clean.startsWith("/member")) return "member";
  if (clean.startsWith("/prizes")) return "prizes";
  if (clean.startsWith("/get-app") || clean === "/app") return "app";
  return "home";
}

/** Which cashier sub-page a pathname is, if any. */
export function subFromPath(pathname: string): CashierSub | null {
  const clean = (pathname || "/").replace(/\/+$/, "");
  if (clean === "/withdraw/bind") return "bind";
  if (clean === "/withdraw/records") return "records";
  return null;
}

/** Which member sub-screen a pathname is, if any. */
export function memberSubFromPath(pathname: string): MemberSub | null {
  const clean = (pathname || "/").replace(/\/+$/, "");
  if (clean === "/member/support") return "support";
  return null;
}

/** Which prize sub-screen a pathname is, if any. */
export function prizeSubFromPath(pathname: string): PrizeSub | null {
  const clean = (pathname || "/").replace(/\/+$/, "");
  if (clean === "/prizes/spin") return "spin";
  if (clean === "/prizes/envelope") return "envelope";
  if (clean === "/prizes/egg") return "egg";
  return null;
}
