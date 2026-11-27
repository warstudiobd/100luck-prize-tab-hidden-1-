"use client";
import { useEffect, useState } from "react";
import { RULES_FALLBACK, type PublicRules } from "./rules";

/**
 * The rules a component renders, server-backed.
 *
 * Starts from RULES_FALLBACK so the first paint is correct and never shows
 * "৳0.00", then swaps in the operator's platform_settings values once
 * /api/rules answers. One fetch per page, shared by every caller.
 */
let cache: Promise<PublicRules> | null = null;

function load(): Promise<PublicRules> {
  if (!cache) {
    cache = fetch("/api/rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok && j.rules ? (j.rules as PublicRules) : RULES_FALLBACK))
      .catch(() => RULES_FALLBACK);
  }
  return cache;
}

export function useRules(): PublicRules {
  const [rules, setRules] = useState<PublicRules>(RULES_FALLBACK);
  useEffect(() => {
    let alive = true;
    load().then((r) => { if (alive) setRules(r); });
    return () => { alive = false; };
  }, []);
  return rules;
}
