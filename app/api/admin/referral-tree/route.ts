/**
 * Referral tree — who referred whom, as a real parent/child tree.
 *
 * The link is a single column: `users.referred_by` holds the inviter's `users.id`,
 * written once at signup from the `?ref=CODE` link (see AuthModal.tsx and
 * app/api/auth/register/route.ts). Everything here is derived from that one edge.
 *
 * Two shapes are returned by the same call:
 *
 *   GET /api/admin/referral-tree                 -> full forest from the roots
 *   GET /api/admin/referral-tree?id=14           -> that user's downline, as a tree
 *   GET /api/admin/referral-tree?id=14&up=1      -> that user's upline, root first
 *
 * The table is small enough (one row per player) that the whole forest is built in
 * memory; that also guarantees the tree cannot disagree with the counts, because
 * both come from the same snapshot.
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { adminAuthError, corsError, corsJson, corsPreflight, resolveAdminResult } from "@/lib/admin-http";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

type Node = {
  id: number;
  name: string;
  referral_code: string;
  referred_by: number | null;
  balance_cents: number;
  is_blocked: boolean;
  is_admin: boolean;
  created_at: string;
  /** how many players this node directly invited */
  direct: number;
  /** how many players in total are underneath it, all depths */
  total: number;
  /** total approved deposits of the players underneath it, in cents */
  deposit_cents: number;
  children: Node[];
};

const MAX_DEPTH = 25;

export async function GET(req: NextRequest) {
  const auth = await resolveAdminResult(req);
  if (!auth.ok) return adminAuthError(auth.reason);

  const { searchParams } = new URL(req.url);
  const focusId = Number(searchParams.get("id") || 0) || null;
  const wantUpline = searchParams.get("up") === "1";

  /* One snapshot of every player. Ordered so a parent is always built before we
     recurse into it in the UI, and so siblings read chronologically. */
  const [players, deposits] = await Promise.all([
    query(
      `SELECT id, username_or_phone, referral_code, referred_by, balance_cents,
              is_blocked, is_admin, created_at
         FROM users
        ORDER BY created_at ASC, id ASC`
    ),
    /* Only money the player actually paid counts. REJECTED and PENDING are not
       revenue and must never be summed into a referral's value. */
    query(
      `SELECT user_id, COALESCE(SUM(amount_cents), 0)::bigint AS s
         FROM cashier_requests
        WHERE request_type = 'DEPOSIT' AND status = 'APPROVED'
        GROUP BY user_id`
    ),
  ]);

  const depositByUser = new Map<number, number>(
    deposits.map((d: any) => [Number(d.user_id), Number(d.s)])
  );

  const byId = new Map<number, Node>();
  for (const p of players as any[]) {
    byId.set(Number(p.id), {
      id: Number(p.id),
      name: String(p.username_or_phone ?? `#${p.id}`),
      referral_code: String(p.referral_code ?? ""),
      referred_by: p.referred_by == null ? null : Number(p.referred_by),
      balance_cents: Number(p.balance_cents ?? 0),
      is_blocked: !!p.is_blocked,
      is_admin: !!p.is_admin,
      created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
      direct: 0,
      total: 0,
      deposit_cents: depositByUser.get(Number(p.id)) ?? 0,
      children: [],
    });
  }

  /* Build the edges. A parent id that no longer exists (deleted account) is
     treated as a root rather than dropping that player out of the tree — losing
     a player from the view would make the counts lie. */
  const roots: Node[] = [];
  for (const node of byId.values()) {
    const parent = node.referred_by != null ? byId.get(node.referred_by) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  /* Post-order roll-up of `total` and `deposit_cents` (all descendants, not just
     children). `visited` also breaks any referrer cycle created by bad data:
     without it a loop would recurse until the stack died. */
  const visited = new Set<number>();
  const rollUp = (node: Node, depth: number): { total: number; deposit_cents: number } => {
    if (visited.has(node.id) || depth > MAX_DEPTH) {
      node.total = 0;
      return { total: 0, deposit_cents: node.deposit_cents };
    }
    visited.add(node.id);
    let total = 0;
    let money = 0;
    for (const child of node.children) {
      const r = rollUp(child, depth + 1);
      total += 1 + r.total;
      money += r.deposit_cents;
    }
    node.direct = node.children.length;
    node.total = total;
    return { total, deposit_cents: node.deposit_cents + money };
  };
  for (const r of roots) rollUp(r, 0);

  /* An orphan whose parent id exists but which was never reached (i.e. it sits in
     a cycle) would otherwise show total 0 forever. Report those separately so the
     panel can flag the bad data instead of silently showing a wrong number. */
  const unreachable = [...byId.values()].filter(n => !visited.has(n.id));

  const withDepth = (nodes: Node[], depth: number): any[] =>
    nodes.map(n => ({
      ...n,
      depth,
      children: withDepth(n.children, depth + 1),
    }));

  let body: Record<string, unknown>;

  if (focusId && wantUpline) {
    /* Walk upward. Guarded by the same visited-set idea so a cycle cannot spin. */
    const chain: any[] = [];
    const seen = new Set<number>([focusId]);
    let cursor = byId.get(focusId)?.referred_by ?? null;
    while (cursor != null && chain.length < MAX_DEPTH) {
      const parent = byId.get(cursor);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.push({ id: parent.id, name: parent.name, referral_code: parent.referral_code, total: parent.total, direct: parent.direct });
      cursor = parent.referred_by;
    }
    const me = byId.get(focusId);
    body = {
      ok: true,
      focus: me ? { id: me.id, name: me.name, referral_code: me.referral_code, referred_by: me.referred_by, total: me.total, direct: me.direct } : null,
      upline: chain.reverse(),
      found: !!me,
    };
  } else if (focusId) {
    const me = byId.get(focusId);
    if (!me) return corsError("user not found", 404);
    body = {
      ok: true,
      focus: {
        id: me.id, name: me.name, referral_code: me.referral_code,
        referred_by: me.referred_by, direct: me.direct, total: me.total,
        balance_cents: me.balance_cents, deposit_cents: me.deposit_cents,
      },
      tree: withDepth(me.children, 1),
      found: true,
    };
  } else {
    body = {
      ok: true,
      tree: withDepth(roots, 0),
      stats: {
        players: byId.size,
        linked: [...byId.values()].filter(n => n.referred_by != null).length,
        inviters: [...byId.values()].filter(n => n.children.length > 0).length,
        roots: roots.length,
        max_depth: (() => {
          const depthOf = (nodes: Node[], d: number): number =>
            nodes.length ? Math.max(...nodes.map(n => depthOf(n.children, d + 1))) : d;
          return roots.length ? Math.max(...roots.map(r => depthOf(r.children, 1))) : 0;
        })(),
        unreachable: unreachable.map(n => ({ id: n.id, name: n.name, referred_by: n.referred_by })),
      },
    };
  }

  return corsJson(body);
}
