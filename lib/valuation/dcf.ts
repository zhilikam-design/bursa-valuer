import type { DcfInputs, DcfResult } from "./types";
import { marginOfSafetyPct, upsidePct, verdictFromUpside } from "./verdict";

/**
 * Discounted Cash Flow (FCFF) valuation.
 *
 *   FCFF_t = FCF_0 * (1 + g)^t
 *   TV     = FCFF_N * (1 + g_term) / (WACC - g_term)   [Gordon terminal]
 *   EV     = Σ PV(FCFF_t) + PV(TV)
 *   Equity = EV - netDebt
 *   Fair value/share = Equity / shares outstanding
 *
 * Adapted from OpenBB Terminal's dcf() and 920linjerry-stack/capital-studio
 * modeling/dcf_calculator.py, localized for Bursa Malaysia.
 */
export function computeDcf(inputs: DcfInputs, price: number): DcfResult {
  const {
    freeCashFlow,
    growthRate,
    terminalGrowthRate,
    discountRate,
    sharesOutstanding,
    netDebt,
    projectionYears = 5,
  } = inputs;

  // Insufficient data: never fabricate a value from zero FCF / zero shares.
  if (!(freeCashFlow > 0) || !(sharesOutstanding > 0)) {
    return {
      model: "dcf",
      applicable: false,
      reason: "Insufficient Financial Data to run DCF",
      cashFlows: [],
      presentValues: [],
      terminalValue: 0,
      terminalValuePv: 0,
      enterpriseValue: 0,
      equityValue: 0,
      fairValuePerShare: 0,
      upsidePct: 0,
      marginOfSafetyPct: 0,
      verdict: "hold",
      breakdown: [],
    };
  }

  const safeShares = sharesOutstanding > 0 ? sharesOutstanding : 1;
  const safeDiscount = discountRate > 0 ? discountRate : 0.092;
  const years = projectionYears > 0 ? Math.round(projectionYears) : 5;

  const cashFlows: number[] = [];
  const presentValues: number[] = [];
  for (let t = 1; t <= years; t++) {
    const cf = freeCashFlow * Math.pow(1 + growthRate, t);
    cashFlows.push(cf);
    presentValues.push(cf / Math.pow(1 + safeDiscount, t));
  }

  const lastCf = cashFlows[cashFlows.length - 1] ?? freeCashFlow;

  // Guard against r <= g (division by zero / negative terminal value)
  let terminalValue: number;
  if (safeDiscount > terminalGrowthRate) {
    terminalValue = (lastCf * (1 + terminalGrowthRate)) / (safeDiscount - terminalGrowthRate);
  } else {
    terminalValue = lastCf / Math.max(safeDiscount, 0.001);
  }
  const terminalValuePv = terminalValue / Math.pow(1 + safeDiscount, years);

  const pvFcfSum = presentValues.reduce((a, b) => a + b, 0);
  const enterpriseValue = pvFcfSum + terminalValuePv;
  const equityValue = enterpriseValue - netDebt;
  const fairValuePerShare = equityValue / safeShares;

  const upside = upsidePct(fairValuePerShare, price);
  const mos = marginOfSafetyPct(fairValuePerShare, price);

  return {
    model: "dcf",
    applicable: true,
    cashFlows,
    presentValues,
    terminalValue,
    terminalValuePv,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    upsidePct: upside,
    marginOfSafetyPct: mos,
    verdict: verdictFromUpside(upside),
    breakdown: [
      { key: "dcf.pvFcf", value: pvFcfSum },
      { key: "dcf.pvTerminal", value: terminalValuePv },
      { key: "dcf.ev", value: enterpriseValue },
      { key: "dcf.equity", value: equityValue },
      { key: "dcf.fairPerShare", value: fairValuePerShare },
    ],
  };
}

/**
 * Sensitivity of DCF fair value per share to the discount rate,
 * used to draw the valuation band chart.
 */
export function dcfSensitivity(
  inputs: DcfInputs,
  rangePts: number[],
): { x: number; fairValue: number }[] {
  return rangePts.map((discountPct) => {
    const discount = discountPct / 100;
    const res = computeDcf({ ...inputs, discountRate: discount }, 0);
    return { x: discountPct, fairValue: res.fairValuePerShare };
  });
}
