/**
 * Two-Stage Dynamic Dividend Discount Model (DDM).
 *
 * Stage 1: 5 years of forecast dividends growing at a dynamically-derived
 *          rate `g` (bank ROE×(1-payout) capped 1%–6%, REIT anchored 2.2%,
 *          others default 2.5%).
 * Stage 2: Gordon terminal value at long-term growth gTerm = 2.0%.
 *
 * Discount rate `r` is CAPM: max(0.035 + beta×0.05, 0.06) — consistent with
 * `lib/bursa.ts` (Rf 3.5%, ERP 5%, floor 6%).
 *
 * Returns null when DPS <= 0 or r <= gTerm (denominator guard).
 */

export interface DDMFinancials {
  symbol: string;
  currentPrice: number;
  dividendPerShare: number; // TTM DPS (RM)
  roe?: number | null;
  payoutRatio?: number | null;
  beta: number;
  sector: "bank" | "reit" | "utilities" | "general";
}

export interface DDMResult {
  symbol: string;
  intrinsicValue: number;
  derivedDivGrowth: number;
  discountRate: number;
  sumDiscountedDividends: number;
  terminalValue: number;
  pvTerminalValue: number;
  marginOfSafetyPct: number;
}

export function calculateDynamicDDM(data: DDMFinancials): DDMResult | null {
  const {
    symbol,
    currentPrice,
    dividendPerShare,
    roe,
    payoutRatio,
    beta,
    sector,
  } = data;

  if (dividendPerShare <= 0) return null;

  // 1. 折现率推导 (CAPM)
  const r = Math.max(0.035 + (beta > 0 ? beta : 1) * 0.05, 0.06);

  // 2. 动态股息增长率推导
  let g = 0.025; // 默认基准 2.5%
  if (sector === "bank" && roe && roe > 0) {
    const payout =
      payoutRatio && payoutRatio > 0 && payoutRatio < 1 ? payoutRatio : 0.6;
    g = Math.max(0.01, Math.min(roe * (1 - payout), 0.06)); // 银行增速约束在 1% ~ 6%
  } else if (sector === "reit") {
    g = 0.022; // 产托锚定租金调整率
  }

  const gTerm = 0.02; // 长期永续增长 2.0%
  if (r <= gTerm) return null; // 分母异常防御

  // 3. 前 5 年股息预测与折现
  let currentDiv = dividendPerShare;
  let sumDiscountedDividends = 0;
  for (let year = 1; year <= 5; year++) {
    currentDiv *= 1 + g;
    const pv = currentDiv / Math.pow(1 + r, year);
    sumDiscountedDividends += pv;
  }

  // 4. 终值折现
  const terminalValue = (currentDiv * (1 + gTerm)) / (r - gTerm);
  const pvTerminalValue = terminalValue / Math.pow(1 + r, 5);
  const intrinsicValue = sumDiscountedDividends + pvTerminalValue;

  const marginOfSafetyPct = ((intrinsicValue - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    intrinsicValue: Number(intrinsicValue.toFixed(2)),
    derivedDivGrowth: Number((g * 100).toFixed(2)),
    discountRate: Number((r * 100).toFixed(2)),
    sumDiscountedDividends: Number(sumDiscountedDividends.toFixed(2)),
    terminalValue: Number(terminalValue.toFixed(2)),
    pvTerminalValue: Number(pvTerminalValue.toFixed(2)),
    marginOfSafetyPct: Number(marginOfSafetyPct.toFixed(2)),
  };
}
