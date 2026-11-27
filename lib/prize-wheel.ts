/**
 * v51 — the festival prize wheel's table (server-side truth).
 *
 * The Lucky Wheel is free, earned one time per approved deposit of at least ৳500,
 * and always awards exactly ৳6. The client animates the server-confirmed result. The client never says "credited" for it.
 */
import crypto from "crypto";

export type WheelPrize = {
  key: string;
  cents: number;
  weight: number;
  physical: boolean;
  labelEn: string;
  labelBn: string;
};

export const WHEEL_PRIZES: WheelPrize[] = [
  { key: "p6", cents: 600, weight: 1, physical: false, labelEn: "৳6", labelBn: "৳৬" },
];

/** Prize-centre economics — the numbers every screen quotes. */
export const TICKET_WAGER_PER_TICKET_CENTS = 100_000; // ৳1,000 qualifying turnover buys one ticket
export const TICKET_GATES_CENTS = [10_000, 100_000, 500_000] as const; // ৳100 / ৳1,000 / ৳5,000 deposit steps
export const TICKET_GATE_PRIZES_CENTS = [100, 200, 500] as const;      // the chips each step shows
export const TICKET_MAX_PER_DAY = 26;
export const DAILY_TARGET_DEFAULT_CENTS = 100_000;                    // ৳1,000.00

export function pickWheelPrize(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let roll = crypto.randomInt(total);
  for (const p of WHEEL_PRIZES) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return WHEEL_PRIZES[0];
}

/** Mask a phone/username the way the reference does: 19******6. */
export function maskWho(who: string): string {
  const s = String(who ?? "");
  if (!s) return "***";
  if (s.length <= 3) return s;
  return `${s.slice(0, 2)}${"*".repeat(Math.max(3, s.length - 3))}${s.slice(-1)}`;
}

/** Mask a winner's name for a physical prize: sha***ed. */
export function maskName(name: string): string {
  const s = String(name ?? "");
  if (!s) return "***";
  if (s.length <= 4) return `${s.slice(0, 1)}***`;
  return `${s.slice(0, 3)}***${s.slice(-1)}`;
}
