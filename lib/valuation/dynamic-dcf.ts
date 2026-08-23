/**
 * Dynamic Discounted Cash Flow (DCF) valuation.
 *
 * Growth rate `g` is derived endogenously (g = ROE × retention, clamped
 * 1%–15%, falling back to the sector preset when ROE is missing/loss-making).
 * Discount rate `r` is CAPM via deriveDiscountRate(). Terminal value uses
 * Gordon growth with g_term = min(TERMINAL_GROWTH_RATE, r - 1%).
 *
 * Returns null when base FCF <= 0 or shares outstanding <= 0.
 */

import type { Sector } from "@/lib/valuation/types";
import {
  SECTOR_PRESETS,
  deriveDiscountRate,
  TERMINAL_GROWTH_RATE,
  PROJECTION_YEARS,
} from "@/lib/bursa";

export interface ValuationFinancials {
  symbol: string;
  currentPrice: number;
  sharesOutstanding: number; // 总股本（股数）
  freeCashFlow: number; // 基准年自由现金流 (RM)
  totalDebt: number; // 总负债
  cashAndEquivalents: number; // 现金及等价物
  roe?: number | null; // 净资产收益率 (小数, 如 0.16)
  payoutRatio?: number | null; // 派息率 (小数, 如 0.40)
  beta: number; // 量化回归或修正后的 Beta
  sector: Sector;
}

export interface DCFProjectionYear {
  year: number;
  fcf: number;
  discountFactor: number;
  discountedFCF: number;
}

export interface DCFValuationResult {
  symbol: string;
  derivedGrowthRate: number; // 动态计算出的预测期 g (小数)
  discountRate: number; // CAPM 计算出的 WACC / Ke (小数)
  terminalGrowthRate: number; // 永续增长率 (小数)
  growthSource: "sustainable_roe" | "sector_preset";
  projections: DCFProjectionYear[];
  sumDiscountedFCF: number; // 5年现金流现值总和
  terminalValue: number; // 第5年末终值 (TV)
  pvTerminalValue: number; // 终值现值
  enterpriseValue: number; // 企业价值 (EV)
  netDebt: number; // 净负债
  equityValue: number; // 股东权益公允价值
  intrinsicValuePerShare: number; // 每股公允估值 (RM)
  marginOfSafetyPct: number; // 安全边际 / 空间 (%)
}

/**
 * 1. 动态内生增长率推导
 * g = ROE × (1 - Payout Ratio)
 */
export function deriveSustainableGrowth(
  sector: Sector,
  roe?: number | null,
  payoutRatio?: number | null,
): { growthRate: number; source: "sustainable_roe" | "sector_preset" } {
  const preset = SECTOR_PRESETS[sector] || SECTOR_PRESETS.general;
  const fallbackGrowth = preset.growthPct / 100;
  // 异常值防御：亏损企业、缺失 ROE 时直接回退至板块预设
  if (roe == null || !isFinite(roe) || roe <= 0) {
    return { growthRate: fallbackGrowth, source: "sector_preset" };
  }
  // 派息率清洗：若缺失或异常，默认假定保留 50% 利润用于再投资
  const safePayout =
    payoutRatio != null &&
    isFinite(payoutRatio) &&
    payoutRatio >= 0 &&
    payoutRatio <= 0.95
      ? payoutRatio
      : 0.5;
  const retentionRate = 1 - safePayout;
  const sustainableRate = roe * retentionRate;
  // 增长率约束区间：下限 1%，上限 15%（避免极端 ROE 导致估值爆炸）
  const clampedGrowth = Math.max(0.01, Math.min(sustainableRate, 0.15));
  return {
    growthRate: Number(clampedGrowth.toFixed(4)),
    source: "sustainable_roe",
  };
}

/**
 * 2. 核心 DCF 估值计算引擎
 */
export function calculateDCFValuation(
  financials: ValuationFinancials,
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
  } = financials;

  // 防御：基准 FCF 为负或股本非法时无法直接跑常规 DCF
  if (freeCashFlow <= 0 || sharesOutstanding <= 0) {
    return null;
  }

  // 步骤 A: 动态推导增长率 (g)
  const { growthRate: g, source: growthSource } = deriveSustainableGrowth(
    sector,
    roe,
    payoutRatio,
  );

  // 步骤 B: 动态推导折现率 (r)
  const r = deriveDiscountRate(beta);

  // 步骤 C: 设定永续增长率 (g_term)，并确保 r > g_term
  const gTerm = Math.min(TERMINAL_GROWTH_RATE, r - 0.01);

  // 步骤 D: 5 年自由现金流预测与折现
  const projections: DCFProjectionYear[] = [];
  let currentFCF = freeCashFlow;
  let sumDiscountedFCF = 0;
  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    currentFCF = currentFCF * (1 + g);
    const discountFactor = 1 / Math.pow(1 + r, year);
    const discountedFCF = currentFCF * discountFactor;
    sumDiscountedFCF += discountedFCF;
    projections.push({
      year,
      fcf: Number(currentFCF.toFixed(2)),
      discountFactor: Number(discountFactor.toFixed(4)),
      discountedFCF: Number(discountedFCF.toFixed(2)),
    });
  }

  // 步骤 E: 终值 (Terminal Value) 计算与折现
  // TV_5 = [FCF_5 * (1 + g_term)] / (r - g_term)
  const finalYearFCF = projections[projections.length - 1].fcf;
  const terminalValue = (finalYearFCF * (1 + gTerm)) / (r - gTerm);
  const pvTerminalValue = terminalValue / Math.pow(1 + r, PROJECTION_YEARS);

  // 步骤 F: 股权价值与每股合理价推导
  // EV = 预测期现金流现值 + 终值现值
  const enterpriseValue = sumDiscountedFCF + pvTerminalValue;
  const netDebt = totalDebt - cashAndEquivalents;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicValuePerShare = equityValue / sharesOutstanding;
  const marginOfSafetyPct =
    ((intrinsicValuePerShare - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    derivedGrowthRate: g,
    discountRate: Number(r.toFixed(4)),
    terminalGrowthRate: gTerm,
    growthSource,
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
