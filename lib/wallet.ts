/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SONALI7 — Seamless Wallet core
 *  Shared by /api/wallet/callback (SoftAggregator → us) and the in-app
 *  demo slot (/api/games/demo-spin). Everything runs inside
 *  BEGIN … COMMIT with SELECT … FOR UPDATE row locks on the user row.
 *  Idempotency: wallet_ledger.call_id is UNIQUE — a provider retry with a
 *  known call_id returns the stored balance_after_cents, never re-applies.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { withTransaction } from "./db";

export type WalletAction = "balance" | "debit" | "credit";
export interface WalletResult {
  ok: boolean;
  errorCode?: number;      // 0 = ok | 1 invalid_signature | 2 stale_timestamp | 3 user_not_found | 4 insufficient_funds | 5 invalid_payload | 6 internal
  message: string;
  balance?: number;        // cents, always returned when known
  duplicate?: boolean;     // true when call_id was already processed
  ledgerId?: number;
}

const ERR = { OK: 0, BAD_SIG: 1, STALE: 2, NO_USER: 3, NO_FUNDS: 4, BAD_PAYLOAD: 5, INTERNAL: 6 } as const;

/** Resolve the callback's user reference → internal users.id.
 *  Accepts a numeric id, a username_or_phone, or a referral-style external ref. */
async function resolveUserId(client: any, ref: string | number): Promise<number | null> {
  const s = String(ref).trim();
  if (/^\d+$/.test(s)) {
    const r = await client.query("SELECT id FROM users WHERE id = $1", [Number(s)]);
    if (r.rows[0]) return Number(r.rows[0].id);
  }
  const r = await client.query("SELECT id FROM users WHERE username_or_phone = $1", [s]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/**
 * Apply one seamless-wallet action atomically.
 * @param p.callId     provider idempotency key (string) — required for debit/credit/rollback
 * @param p.rb         1 when rolling back a previous transaction of the opposite sign
 * @param p.amountCents integer cents (already scaled)
 */
export async function processWalletAction(p: {
  callId?: string | null;
  userRef: string | number;
  action: WalletAction;
  amountCents?: number;
  rb?: number;
  providerCode?: string;
  gameCode?: string;
  txSubtype?: string;
}): Promise<WalletResult> {
  const { action, rb = 0 } = p;
  const amountCents = Math.trunc(Number(p.amountCents ?? 0));
  const callId = p.callId ? String(p.callId).slice(0, 128) : null;
  const provider = (p.providerCode || "INTERNAL").toUpperCase().slice(0, 32);
  const game = (p.gameCode || "").slice(0, 64);
  const subtype = (p.txSubtype || (rb === 1 ? "rollback" : "generic")).slice(0, 32);

  if (action !== "balance" && (!Number.isFinite(amountCents) || amountCents < 0)) {
    return { ok: false, errorCode: ERR.BAD_PAYLOAD, message: "amount_cents must be a non-negative integer" };
  }

  try {
    return await withTransaction(async (client) => {
      // ── Idempotency short-circuit (inside the tx, so two concurrent retries serialize) ──
      if (callId) {
        const prior = await client.query(
          "SELECT id, balance_after_cents FROM wallet_ledger WHERE call_id = $1",
          [callId]
        );
        if (prior.rows[0]) {
          return { ok: true, message: "duplicate call_id — original result returned", balance: Number(prior.rows[0].balance_after_cents), duplicate: true, ledgerId: Number(prior.rows[0].id) };
        }
      }

      const userId = await resolveUserId(client, p.userRef);
      if (userId == null) return { ok: false, errorCode: ERR.NO_USER, message: "user not found" };

      // ── Row lock: no other debit/credit can interleave with this read-modify-write ──
      const locked = await client.query(
        "SELECT balance_cents, is_blocked FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );
      if (!locked.rows[0]) return { ok: false, errorCode: ERR.NO_USER, message: "user not found" };
      if (locked.rows[0].is_blocked) return { ok: false, errorCode: ERR.NO_USER, message: "user not found" };
      const before = Number(locked.rows[0].balance_cents);

      if (action === "balance") {
        return { ok: true, message: "ok", balance: before };
      }

      let delta = 0;
      let actionType: "DEBIT" | "CREDIT" | "ROLLBACK" = "DEBIT";

      if (action === "debit") {
        if (rb === 1) {
          // Rollback of a prior CREDIT → take the money back (provider already paid out)
          delta = amountCents; actionType = "ROLLBACK";
        } else {
          // Normal bet placement → funds must exist
          if (before < amountCents) {
            return { ok: false, errorCode: ERR.NO_FUNDS, message: "insufficient balance", balance: before };
          }
          delta = -amountCents; actionType = "DEBIT";
        }
      } else { // credit
        if (rb === 1) {
          // Rollback of a prior DEBIT → return the money (floor at 0, never negative)
          delta = -Math.min(before, amountCents); actionType = "ROLLBACK";
        } else {
          // Win / bonus (e.g. bonus_fs) with NO prior debit → still pay out
          delta = amountCents; actionType = "CREDIT";
        }
      }

      const after = before + delta;
      if (after < 0) {
        return { ok: false, errorCode: ERR.NO_FUNDS, message: "insufficient balance (rollback floor)", balance: before };
      }

      await client.query("UPDATE users SET balance_cents = $1 WHERE id = $2", [after, userId]);
      const ins = await client.query(
        `INSERT INTO wallet_ledger
           (call_id, user_id, provider_code, game_code, action_type, tx_subtype,
            amount_cents, balance_before_cents, balance_after_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [callId, userId, provider, game, actionType, subtype, Math.abs(delta), before, after]
      );

      // Referral qualification: game bets count toward the ৳3,000 wager leg.
      // Never let a bonus bug block a provider callback — log and continue.
      if (actionType === "DEBIT" && game) {
        try {
          const { checkReferralOnWager } = await import("./bonus");
          await checkReferralOnWager(client, userId);
        } catch (e) {
          console.error("[wallet] referral wager check failed", e);
        }
      }

      return { ok: true, message: "ok", balance: after, ledgerId: Number(ins.rows[0].id) };
    });
  } catch (err: any) {
    // Unique-violation race on call_id (two identical requests in-flight) → treat as duplicate
    if (err?.code === "23505" && callId) {
      const prior = await import("./db").then(m => m.query(
        "SELECT id, balance_after_cents FROM wallet_ledger WHERE call_id = $1", [callId]).catch(() => []));
      if (prior[0]) return { ok: true, message: "duplicate call_id — original result returned", balance: Number(prior[0].balance_after_cents), duplicate: true };
    }
    console.error("[wallet] internal error", err);
    return { ok: false, errorCode: ERR.INTERNAL, message: "internal wallet error" };
  }
}

/** Scale a provider-sent amount to integer cents.
 *  Accepts `amount_cents` directly, or a decimal `amount` in taka ("250.50" → 25050). */
export function toCents(body: any): number {
  if (body?.amount_cents !== undefined && body?.amount_cents !== null && body?.amount_cents !== "") {
    return Math.round(Number(body.amount_cents));
  }
  const a = Number(body?.amount);
  if (!Number.isFinite(a)) return NaN;
  return Math.round(a * 100);
}
export { ERR as WALLET_ERR };
