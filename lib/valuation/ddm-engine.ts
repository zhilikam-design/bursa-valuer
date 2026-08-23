// ===========================================================================
// Two-Stage Dynamic Dividend Discount Model (automated pipeline).
//
// Stage 1: 5 years of forecast dividends growing at a dynamically-derived
//          rate `g` (bank ROE×(1-payout) capped 1%–6%, REIT anchored to the
//          sector preset, others default to the sector preset).
// Stage 2: Gordon terminal value at gTerm = min(TERMINAL_GROWTH_RATE, r-1%).
//
// Discount rate `r` is CAPM: max(0.035 + beta×0.05, 0.06).
// Returns null when DPS <= 0 or r <= gTerm (denominator guard).
// ===========================================================================

import type { Sector } from "./types";
import {
  SECTOR_PRESETS,
  deriveDiscountRate,
  TERMINAL_GROWTH_RATE,
} from "./bursa-ticker";

export interface DDMValuationResult {
  symbol: string;
  intrinsicValue: number;
  derivedDivGrowth: number; // 股息增长率 (% 点位)
  discountRate: number; // 折现率 (% 点位)
  sumDiscountedDividends: number;
  terminalValue: number;
  pvTerminalValue: number;
  marginOfSafetyPct: number;
}

export function calculateDynamicDDM(
  input: {
    symbol: string;
    currentPrice: number;
    dividendPerShare: number;
    roe?: number | null;
    payoutRatio?: number | null;
    beta: number;
    sector: Sector;
  },
): DDMValuationResult | null {
  const {
    symbol,
    currentPrice,
    dividendPerShare,
    roe,
    payoutRatio,
    beta,
    sector,
  } = input;

  if (dividendPerShare <= 0) return null;

  const preset = SECTOR_PRESETS[sector as Sector] || SECTOR_PRESETS.general;

  // 1. 折现率推导 (CAPM)
  const discountRate = deriveDiscountRate(beta);

  // 2. 动态股息增长率推导
  let g = preset.divGrowthPct / 100; // 默认板块预设
  if (sector === "bank" && roe != null && isFinite(roe) && roe > 0) {
    const payout =
      payoutRatio != null && isFinite(payoutRatio) && payoutRatio > 0 && payoutRatio < 1
        ? payoutRatio
        : 0.6;
    g = Math.max(0.01, Math.min(roe * (1 - payout), 0.06)); // 银行增速约束在 1% ~ 6%
  } else if (sector === "reit") {
    g = Math.max(preset.divGrowthPct / 100, 0.022); // 产托锚定租金调整率
  }

  // 3. 永续增长率 (确保 r > gTerm)
  const gTerm = Math.min(TERMINAL_GROWTH_RATE, discountRate - 0.01);
  if (discountRate <= gTerm) return null; // 分母异常防御

  // 4. 前 5 年股息预测与折现
  let currentDiv = dividendPerShare;
  let sumDiscountedDividends = 0;
  for (let year = 1; year <= 5; year++) {
    currentDiv *= 1 + g;
    const pv = currentDiv / Math.pow(1 + discountRate, year);
    sumDiscountedDividends += pv;
  }

  // 5. 终值折现
  const terminalValue = (currentDiv * (1 + gTerm)) / (discountRate - gTerm);
  const pvTerminalValue = terminalValue / Math.pow(1 + discountRate, 5);
  const intrinsicValue = sumDiscountedDividends + pvTerminalValue;
  const marginOfSafetyPct = ((intrinsicValue - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    intrinsicValue: Number(intrinsicValue.toFixed(2)),
    derivedDivGrowth: Number((g * 100).toFixed(2)),
    discountRate: Number((discountRate * 100).toFixed(2)),
    sumDiscountedDividends: Number(sumDiscountedDividends.toFixed(2)),
    terminalValue: Number(terminalValue.toFixed(2)),
    pvTerminalValue: Number(pvTerminalValue.toFixed(2)),
    marginOfSafetyPct: Number(marginOfSafetyPct.toFixed(2)),
  };
}
