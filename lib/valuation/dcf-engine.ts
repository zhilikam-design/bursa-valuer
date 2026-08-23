// ===========================================================================
// Dynamic DCF engine (automated pipeline).
//
// Growth rate `g` is derived endogenously (g = ROE × retention, clamped
// 1%–15%, falling back to the sector preset when ROE is missing/loss-making),
// then glides back toward the sector preset over the projection window.
// Discount rate `r` is CAPM via deriveDiscountRate().
//
// Returns null when base FCF <= 0 or shares outstanding <= 0.
// ===========================================================================

import type { Sector } from "./types";
import {
  SECTOR_PRESETS,
  deriveDiscountRate,
  TERMINAL_GROWTH_RATE,
  PROJECTION_YEARS,
} from "./bursa-ticker";

export interface DCFValuationResult {
  symbol: string;
  derivedGrowthRate: number; // 预测期初始 g (小数)
  growthSource: "sustainable_roe" | "sector_preset";
  discountRate: number; // CAPM Ke/WACC (小数)
  terminalGrowthRate: number; // 永续增长率 (小数)
  projections: {
    year: number;
    growthRatePct: number;
    fcf: number;
    discountFactor: number;
    discountedFCF: number;
  }[];
  sumDiscountedFCF: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  intrinsicValuePerShare: number;
  marginOfSafetyPct: number;
}

export function calculateDCFValuation(
  input: {
    symbol: string;
    currentPrice: number;
    sharesOutstanding: number;
    freeCashFlow: number;
    totalDebt: number;
    cashAndEquivalents: number;
    roe?: number | null;
    payoutRatio?: number | null;
    beta: number;
    sector: Sector;
  },
): DCFValuationResult | null {
  const {
    symbol,
    currentPrice,
    sharesOutstanding,
    freeCashFlow,
    totalDebt,
    cashAndEquivalents,
    roe,
    payoutRatio,
    beta,
    sector,
  } = input;

  // 防御：基准 FCF 为负或股本非法时无法直接跑常规 DCF
  if (freeCashFlow <= 0 || sharesOutstanding <= 0) return null;

  const preset = SECTOR_PRESETS[sector as Sector] || SECTOR_PRESETS.general;
  const fallbackGrowth = preset.growthPct / 100;

  // 1. 动态内生增长率推导 (g = ROE × retention, 约束 1%~15%)
  let derivedGrowthRate = fallbackGrowth;
  let growthSource: "sustainable_roe" | "sector_preset" = "sector_preset";
  if (roe != null && isFinite(roe) && roe > 0) {
    const safePayout =
      payoutRatio != null &&
      isFinite(payoutRatio) &&
      payoutRatio >= 0 &&
      payoutRatio <= 0.95
        ? payoutRatio
        : 0.5;
    derivedGrowthRate = Math.max(0.01, Math.min(roe * (1 - safePayout), 0.15));
    growthSource = "sustainable_roe";
  }

  // 2. 折现率 (CAPM) + 永续增长率 (确保 r > g_term)
  const discountRate = deriveDiscountRate(beta);
  const gTerm = Math.min(TERMINAL_GROWTH_RATE, discountRate - 0.01);
  if (discountRate <= gTerm) return null;

  // 3. 增长衰减路径：前 2 年保持内生 g，随后向永续增长率 g_term 单调衰减。
  //    锚点必须是 g_term（而非板块预设），否则低 ROE 股票的增速会被上修，
  //    破坏「增速递减」不变量。gStart 钳制到 >= g_term 保证单调不增。
  const decay = [0, 0, 0.33, 0.66, 0.9];
  const gStart = Math.max(derivedGrowthRate, gTerm);
  const projections: DCFValuationResult["projections"] = [];
  let currentFCF = freeCashFlow;
  let sumDiscountedFCF = 0;
  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    const yearGrowth = gStart + (gTerm - gStart) * (decay[year - 1] ?? 1);
    currentFCF = currentFCF * (1 + yearGrowth);
    const discountFactor = 1 / Math.pow(1 + discountRate, year);
    const discountedFCF = currentFCF * discountFactor;
    sumDiscountedFCF += discountedFCF;
    projections.push({
      year,
      growthRatePct: Number((yearGrowth * 100).toFixed(2)),
      fcf: Number(currentFCF.toFixed(2)),
      discountFactor: Number(discountFactor.toFixed(4)),
      discountedFCF: Number(discountedFCF.toFixed(2)),
    });
  }

  // 4. 终值 (Gordon) 与股权价值推导
  const finalYearFCF = projections[projections.length - 1].fcf;
  const terminalValue = (finalYearFCF * (1 + gTerm)) / (discountRate - gTerm);
  const pvTerminalValue = terminalValue / Math.pow(1 + discountRate, PROJECTION_YEARS);
  const enterpriseValue = sumDiscountedFCF + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicValuePerShare = equityValue / sharesOutstanding;
  const marginOfSafetyPct =
    ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    derivedGrowthRate: Number(derivedGrowthRate.toFixed(4)),
    growthSource,
    discountRate: Number(discountRate.toFixed(4)),
    terminalGrowthRate: gTerm,
    projections,
    sumDiscountedFCF: Number(sumDiscountedFCF.toFixed(2)),
    terminalValue: Number(terminalValue.toFixed(2)),
    pvTerminalValue: Number(pvTerminalValue.toFixed(2)),
    enterpriseValue: Number(enterpriseValue.toFixed(2)),
    netDebt: Number(netDebt.toFixed(2)),
    equityValue: Number(equityValue.toFixed(2)),
    intrinsicValuePerShare: Number(intrinsicValuePerShare.toFixed(2)),
    marginOfSafetyPct: Number(marginOfSafetyPct.toFixed(2)),
  };
}
