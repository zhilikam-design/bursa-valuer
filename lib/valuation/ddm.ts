import type { DdmInputs, DdmResult } from "./types";
import { marginOfSafetyPct, upsidePct, verdictFromUpside } from "./verdict";

/**
 * Gordon Growth Model (single-stage dividend discount model).
 *
 *   P0 = DPS * (1 + g) / (r - g)
 *
 * Preferred model for Malaysian banks, REITs and utilities, which are
 * mature, dividend-paying businesses (Maybank, Public Bank, REITs, Tenaga…).
 * Mirrors OpenBB's ddm() convention, localized for Bursa Malaysia.
 */
export function computeDdm(inputs: DdmInputs, price: number): DdmResult {
  const { dividendPerShare, dividendGrowthRate, requiredReturn } = inputs;

  // No dividend data: DDM is not applicable (never fabricate a dividend).
  if (!(dividendPerShare > 0)) {
    return {
      model: "ddm",
      applicable: false,
      reason: "No dividend data — DDM not applicable",
      nextDps: 0,
      fairValuePerShare: 0,
      dividendYieldPct: 0,
      upsidePct: 0,
      marginOfSafetyPct: 0,
      verdict: "hold",
      breakdown: [],
    };
  }

  const safeReturn = requiredReturn > 0 ? requiredReturn : 0.09;
  const nextDps = dividendPerShare * (1 + dividendGrowthRate);

  // Gordon model safety: enforce (r - g) >= 2.0%; clamp and warn otherwise.
  let denominator = safeReturn - dividendGrowthRate;
  let warning: string | undefined;
  if (denominator < 0.02) {
    warning = "Growth rate too close to discount rate";
    denominator = 0.02;
  }
  const fairValuePerShare = nextDps / denominator;

  const upside = upsidePct(fairValuePerShare, price);
  const mos = marginOfSafetyPct(fairValuePerShare, price);
  const forwardYield = fairValuePerShare > 0 ? nextDps / fairValuePerShare : 0;

  return {
    model: "ddm",
    applicable: true,
    warning,
    nextDps,
    fairValuePerShare,
    dividendYieldPct: forwardYield,
    upsidePct: upside,
    marginOfSafetyPct: mos,
    verdict: verdictFromUpside(upside),
    breakdown: [
      { key: "ddm.nextDps", value: nextDps },
      { key: "ddm.fairPerShare", value: fairValuePerShare },
      { key: "ddm.yield", value: forwardYield, kind: "percent" },
    ],
  };
}

/**
 * Derive a sustainable dividend growth rate from ROE and payout ratio:
 *   g = ROE * (1 - payout)
 * Useful as a sanity-check default for banks/REITs.
 */
export function sustainableGrowth(roe: number, payoutRatio: number): number {
  if (roe <= 0) return 0;
  return roe * (1 - Math.min(Math.max(payoutRatio, 0), 1));
}
