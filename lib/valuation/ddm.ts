import type { DdmInputs, DdmResult } from "./types";
import { marginOfSafetyPct, upsidePct, verdictFromUpside } from "./verdict";

/**
 * Gordon Growth Model (single-stage dividend discount model).
 *
 *   P0 = DPS * (1 + g) / (r - g)
 *
 * Preferred model for Malaysian banks & REITs, which are mature,
 * dividend-paying businesses (Maybank, Public Bank, REITs, etc.).
 * Mirrors OpenBB's ddm() convention, localized for Bursa Malaysia.
 */
export function computeDdm(inputs: DdmInputs, price: number): DdmResult {
  const { dividendPerShare, dividendGrowthRate, requiredReturn } = inputs;

  const safeReturn = requiredReturn > 0 ? requiredReturn : 0.09;
  const nextDps = dividendPerShare * (1 + dividendGrowthRate);

  // Guard against r <= g
  let fairValuePerShare: number;
  if (safeReturn > dividendGrowthRate) {
    fairValuePerShare = nextDps / (safeReturn - dividendGrowthRate);
  } else {
    fairValuePerShare = nextDps / Math.max(safeReturn, 0.001);
  }

  const upside = upsidePct(fairValuePerShare, price);
  const mos = marginOfSafetyPct(fairValuePerShare, price);
  const forwardYield = fairValuePerShare > 0 ? nextDps / fairValuePerShare : 0;

  return {
    model: "ddm",
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
