import {
  DEFAULT_GROWTH_RATE,
  TERMINAL_GROWTH_RATE,
  deriveDiscountRate,
  normalizeSector,
} from "./bursa";
import { computeDcf, computeDdm, computePeBand } from "./valuation";
import type { Sector } from "./valuation/types";

export type ValuationMethod = "DDM" | "DCF" | "PE";

export interface CalculateStockValuationInput {
  sector: string; // raw sector string / enum, normalized internally
  currentPrice: number;
  dividendRate: number | null; // DPS
  freeCashflow: number | null; // RM millions
  sharesOutstanding: number | null; // millions
  beta: number | null;
  eps?: number | null;
}

export interface CalculateStockValuationResult {
  method: ValuationMethod;
  intrinsicValue: number;
  currentPrice: number;
  discountRate: number;
  beta: number;
  sector: Sector;
}

/**
 * Unified valuation entrypoint used by the verification script.
 * Sector routing: Financial Services / Utilities / Real Estate -> DDM,
 * everything else -> DCF (with PE as a secondary fallback).
 */
export function calculateStockValuation(
  input: CalculateStockValuationInput,
): CalculateStockValuationResult {
  const sector = normalizeSector(input.sector);
  const beta = input.beta != null && isFinite(input.beta) ? input.beta : 1;
  const r = deriveDiscountRate(beta);
  const g = DEFAULT_GROWTH_RATE;
  const price = input.currentPrice > 0 ? input.currentPrice : 0;

  const ddm = computeDdm(
    {
      dividendPerShare: input.dividendRate ?? 0,
      dividendGrowthRate: g,
      requiredReturn: r,
    },
    price,
  );
  const dcf = computeDcf(
    {
      freeCashFlow: input.freeCashflow ?? 0,
      growthRate: g,
      terminalGrowthRate: TERMINAL_GROWTH_RATE,
      discountRate: r,
      sharesOutstanding: input.sharesOutstanding ?? 0,
      netDebt: 0,
    },
    price,
  );
  const pe = computePeBand(
    {
      normalizedEps: input.eps ?? 0,
      peLow: 10,
      peBase: 14,
      peHigh: 18,
      growthRate: g,
    },
    price,
  );

  const ddmPrimary = ["bank", "reit", "utilities"].includes(sector);
  const order: ("ddm" | "dcf" | "pe")[] = ddmPrimary
    ? ["ddm", "dcf", "pe"]
    : ["dcf", "pe", "ddm"];

  const results = { ddm, dcf, pe };
  let method: ValuationMethod = ddmPrimary ? "DDM" : "DCF";
  let intrinsicValue = 0;

  for (const m of order) {
    if (results[m].applicable) {
      method = m === "ddm" ? "DDM" : m === "dcf" ? "DCF" : "PE";
      intrinsicValue =
        m === "ddm"
          ? ddm.fairValuePerShare
          : m === "dcf"
            ? dcf.fairValuePerShare
            : pe.fairValueBase;
      break;
    }
  }

  return {
    method,
    intrinsicValue,
    currentPrice: price,
    discountRate: r,
    beta,
    sector,
  };
}
