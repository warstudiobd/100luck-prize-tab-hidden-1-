/**
 * Withdrawal PIN — the second lock on a payout.
 *
 * Rules (enforced here, on the server, never only in the UI):
 *   • 4–6 digits, set by the player on their first payout-wallet bind.
 *   • Binding another payout wallet requires the existing PIN.
 *   • Every withdrawal request requires the PIN.
 *   • 5 wrong attempts → a 15-minute lock, because 4-digit PINs are guessable.
 *
 * Only a bcrypt hash is stored (users.withdraw_pin_hash); the PIN never leaves the
 * browser in a form we log, and it is never returned by any API.
 */
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

const PIN_RE = /^\d{4,6}$/;

type PinRow = {
  withdraw_pin_hash: string | null;
  withdraw_pin_failures: number | null;
  withdraw_pin_locked_until: string | null;
};

export type PinState =
  | { ok: true; set: boolean }
  | { ok: false; error: string; code: string; retry_after_seconds?: number };

export function isValidPinFormat(pin: string): boolean {
  return PIN_RE.test(pin);
}

/** Has this player set a PIN yet? (used by the UI to decide "create" vs "enter"). */
export async function getPinState(userId: number): Promise<{ set: boolean; locked: boolean }> {
  const [row] = await query(
    "SELECT withdraw_pin_hash, withdraw_pin_locked_until FROM users WHERE id = $1",
    [userId]
  ) as unknown as PinRow[];
  const locked = row?.withdraw_pin_locked_until
    ? new Date(row.withdraw_pin_locked_until).getTime() > Date.now()
    : false;
  return { set: Boolean(row?.withdraw_pin_hash), locked };
}

/** Set or replace the PIN. Replacing needs the current PIN (or a fresh one on first use). */
export async function setPin(userId: number, pin: string, currentPin?: string): Promise<PinState> {
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: `PIN must be ${PIN_MIN}–${PIN_MAX} digits`, code: "pin_format" };
  }
  const [row] = await query(
    "SELECT withdraw_pin_hash, withdraw_pin_failures, withdraw_pin_locked_until FROM users WHERE id = $1",
    [userId]
  ) as unknown as PinRow[];
  if (!row) return { ok: false, error: "user not found", code: "user_not_found" };
  // Same backend as verifyPin(): a locked account cannot be re-keyed with a guessed
  // "current PIN", otherwise the 15-minute lock would be trivial to sidestep.
  if (row.withdraw_pin_locked_until && new Date(row.withdraw_pin_locked_until).getTime() > Date.now()) {
    const retry = Math.ceil((new Date(row.withdraw_pin_locked_until).getTime() - Date.now()) / 1000);
    return { ok: false, error: `Too many wrong PINs — try again in ${Math.ceil(retry / 60)} min`, code: "pin_locked", retry_after_seconds: retry };
  }

  if (row.withdraw_pin_hash) {
    if (!currentPin) return { ok: false, error: "Current PIN is required", code: "pin_required" };
    const ok = await bcrypt.compare(currentPin, row.withdraw_pin_hash);
    if (!ok) return { ok: false, error: "Current PIN is incorrect", code: "pin_wrong" };
  }

  const hash = await bcrypt.hash(pin, 10);
  await query(
    "UPDATE users SET withdraw_pin_hash = $1, withdraw_pin_failures = 0, withdraw_pin_locked_until = NULL WHERE id = $2",
    [hash, userId]
  );
  return { ok: true, set: true };
}

/**
 * Verify a PIN before a bind-withdraws or a withdrawal.
 * Returns ok:false with a precise reason so the client can say what to fix instead of
 * "something went wrong".
 */
export async function verifyPin(userId: number, pin: string): Promise<PinState> {
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: `PIN must be ${PIN_MIN}–${PIN_MAX} digits`, code: "pin_format" };
  }
  const [row] = await query(
    "SELECT withdraw_pin_hash, withdraw_pin_failures, withdraw_pin_locked_until FROM users WHERE id = $1",
    [userId]
  ) as unknown as PinRow[];
  if (!row) return { ok: false, error: "user not found", code: "user_not_found" };
  if (!row.withdraw_pin_hash) {
    return { ok: false, error: "Set a withdrawal PIN first", code: "pin_not_set" };
  }

  const lockedUntil = row.withdraw_pin_locked_until ? new Date(row.withdraw_pin_locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return {
      ok: false,
      error: `Too many wrong PINs — try again in ${Math.ceil((lockedUntil - Date.now()) / 60000)} min`,
      code: "pin_locked",
      retry_after_seconds: Math.ceil((lockedUntil - Date.now()) / 1000),
    };
  }

  const ok = await bcrypt.compare(pin, row.withdraw_pin_hash);
  if (!ok) {
    const failures = Number(row.withdraw_pin_failures ?? 0) + 1;
    if (failures >= MAX_FAILURES) {
      await query(
        "UPDATE users SET withdraw_pin_failures = 0, withdraw_pin_locked_until = NOW() + ($2 || ' minutes')::interval WHERE id = $1",
        [userId, String(LOCK_MINUTES)]
      );
      return {
        ok: false,
        error: `Too many wrong PINs — locked for ${LOCK_MINUTES} minutes`,
        code: "pin_locked",
        retry_after_seconds: LOCK_MINUTES * 60,
      };
    }
    await query("UPDATE users SET withdraw_pin_failures = $1 WHERE id = $2", [failures, userId]);
    return {
      ok: false,
      error: `Wrong PIN — ${MAX_FAILURES - failures} attempt${MAX_FAILURES - failures === 1 ? "" : "s"} left`,
      code: "pin_wrong",
    };
  }

  await query("UPDATE users SET withdraw_pin_failures = 0 WHERE id = $1", [userId]);
  return { ok: true, set: true };
}
