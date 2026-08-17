import type { Verdict } from "./types";

/**
 * Map an upside percentage to a buy/hold/sell verdict.
 * Upside = (fair value - price) / price * 100.
 */
export function verdictFromUpside(upsidePct: number): Verdict {
  if (upsidePct >= 20) return "buy";
  if (upsidePct <= -10) return "sell";
  return "hold";
}

export function upsidePct(fairValue: number, price: number): number {
  if (!isFinite(price) || price <= 0) return 0;
  return ((fairValue - price) / price) * 100;
}

export function marginOfSafetyPct(fairValue: number, price: number): number {
  if (!isFinite(fairValue) || fairValue <= 0) return 0;
  return ((fairValue - price) / fairValue) * 100;
}
