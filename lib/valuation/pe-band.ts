import type { PeBandInputs, PeBandResult } from "./types";
import { marginOfSafetyPct, upsidePct, verdictFromUpside } from "./verdict";

/**
 * Normalized PE Band valuation.
 *
 *   Fair value = normalized EPS * PE multiple (bear / base / bull)
 *
 * Preferred model for tech & consumer names (Inari, Nestlé Malaysia),
 * where earnings normalize through the cycle and DCF/DDM are less
 * reliable. Adapted from the comparable-company logic in
 * 920linjerry-stack/capital-studio modeling/trading_comps.py.
 */
export function computePeBand(inputs: PeBandInputs, price: number): PeBandResult {
  const { normalizedEps, peLow, peBase, peHigh } = inputs;

  const fairValueLow = normalizedEps * peLow;
  const fairValueBase = normalizedEps * peBase;
  const fairValueHigh = normalizedEps * peHigh;

  const upside = upsidePct(fairValueBase, price);
  const mos = marginOfSafetyPct(fairValueBase, price);

  return {
    model: "pe",
    fairValueLow,
    fairValueBase,
    fairValueHigh,
    upsidePct: upside,
    marginOfSafetyPct: mos,
    verdict: verdictFromUpside(upside),
    breakdown: [
      { key: "pe.fvLow", value: fairValueLow },
      { key: "pe.fvBase", value: fairValueBase },
      { key: "pe.fvHigh", value: fairValueHigh },
    ],
  };
}
