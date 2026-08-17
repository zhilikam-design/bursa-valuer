import type { PeBandInputs, PeBandResult } from "./types";
import { marginOfSafetyPct, upsidePct, verdictFromUpside } from "./verdict";

export interface PEValuationResult {
  isApplicable: boolean;
  fairValue: number | null;
  reason?: string;
}

/**
 * 目标市盈率定价法 (P/E Multiple)
 * 当 EPS <= 0 时直接熔断判定不可用
 */
export function calculatePEFairValue(
  eps: number | null | undefined,
  targetPE: number,
  growthRate: number,
): PEValuationResult {
  // 1. 负数或缺失 EPS 判定拦截
  if (eps === null || eps === undefined || eps <= 0) {
    return {
      isApplicable: false,
      fairValue: null,
      reason: "EPS 为负数或数据缺失，P/E 估值模型不适用（亏损企业）",
    };
  }
  // 2. 正常盈利企业计算公允价
  const forwardEPS = eps * (1 + growthRate);
  const fairValue = Number((forwardEPS * targetPE).toFixed(2));
  return {
    isApplicable: true,
    fairValue,
  };
}

/**
 * Normalized PE Band valuation.
 *
 *   Forward EPS  = EPS * (1 + g)
 *   Fair value   = Forward EPS * PE multiple (bear / base / bull)
 *
 * Preferred model for tech & consumer names (Inari, Nestlé Malaysia),
 * where earnings normalize through the cycle and DCF/DDM are less
 * reliable. Adapted from the comparable-company logic in
 * 920linjerry-stack/capital-studio modeling/trading_comps.py.
 *
 * The base fair value reuses calculatePEFairValue(); loss-making
 * counters (EPS <= 0) are fused out as not applicable.
 */
export function computePeBand(inputs: PeBandInputs, price: number): PeBandResult {
  const { normalizedEps, peLow, peBase, peHigh, growthRate = 0 } = inputs;

  const base = calculatePEFairValue(normalizedEps, peBase, growthRate);
  if (!base.isApplicable || base.fairValue == null) {
    // Loss-making: PE multiples are meaningless on negative earnings.
    return {
      model: "pe",
      applicable: false,
      reason: base.reason,
      fairValueLow: 0,
      fairValueBase: 0,
      fairValueHigh: 0,
      upsidePct: 0,
      marginOfSafetyPct: 0,
      verdict: "hold",
      breakdown: [],
    };
  }

  const forwardEps = normalizedEps * (1 + growthRate);
  const fairValueLow = Number((forwardEps * peLow).toFixed(2));
  const fairValueBase = base.fairValue;
  const fairValueHigh = Number((forwardEps * peHigh).toFixed(2));

  const upside = upsidePct(fairValueBase, price);
  const mos = marginOfSafetyPct(fairValueBase, price);

  return {
    model: "pe",
    applicable: true,
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
