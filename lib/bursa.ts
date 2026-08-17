import type { Sector } from "@/lib/valuation/types";

export const CURRENCY = "MYR";
export const CURRENCY_SYMBOL = "RM";

// --- Bursa Malaysia market defaults (BursaValuer spec) ---
export const MGS_10Y_YIELD = 0.038; // Malaysia 10Y Government Securities yield
export const EQUITY_RISK_PREMIUM = 0.054; // Malaysia equity risk premium
export const BASELINE_DISCOUNT_RATE = 0.092; // rf (3.80%) + ERP (5.40%) at beta = 1
export const CORPORATE_TAX_RATE = 0.24;
export const TERMINAL_GROWTH_RATE = 0.03;
export const PROJECTION_YEARS = 5;

export interface MarketAssumptions {
  riskFreeRate: number;
  equityRiskPremium: number;
  corporateTaxRate: number;
  baselineDiscountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
}

export const MARKET_ASSUMPTIONS: MarketAssumptions = {
  riskFreeRate: MGS_10Y_YIELD,
  equityRiskPremium: EQUITY_RISK_PREMIUM,
  corporateTaxRate: CORPORATE_TAX_RATE,
  baselineDiscountRate: BASELINE_DISCOUNT_RATE,
  terminalGrowthRate: TERMINAL_GROWTH_RATE,
  projectionYears: PROJECTION_YEARS,
};

/**
 * Normalize any Bursa ticker input into Yahoo-style "NNNN.KL".
 * Accepts "1155", "0166", "1155.KL", "klse:1155", " 0166 " etc.
 */
export function normalizeTicker(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  const code = cleaned
    .replace(/^KLSE:/, "")
    .replace(/\.KL$/, "")
    .replace(/^\./, "");
  return `${code}.KL`;
}

/** Return the bare 4-digit Bursa code ("1155.KL" -> "1155"). */
export function toBursaCode(input: string): string {
  return normalizeTicker(input).replace(/\.KL$/, "");
}

export function isBursaCode(input: string): boolean {
  return /^\d{4}$/.test(toBursaCode(input));
}

export type ModelId = "dcf" | "ddm" | "pe";

export interface SectorPreset {
  primaryModel: ModelId;
  growthPct: number; // FCF growth, percent points
  terminalGrowthPct: number;
  discountPct: number; // WACC / required return, percent points
  divGrowthPct: number;
  requiredReturnPct: number;
  peLow: number;
  peBase: number;
  peHigh: number;
}

/**
 * Sector presets — which valuation model is primary, plus sensible
 * starting assumptions for Bursa Malaysia names.
 */
export const SECTOR_PRESETS: Record<Sector, SectorPreset> = {
  bank: {
    primaryModel: "ddm",
    growthPct: 4,
    terminalGrowthPct: 3,
    discountPct: 9.2,
    divGrowthPct: 4,
    requiredReturnPct: 9,
    peLow: 10,
    peBase: 13,
    peHigh: 16,
  },
  reit: {
    primaryModel: "ddm",
    growthPct: 3,
    terminalGrowthPct: 2.5,
    discountPct: 7.5,
    divGrowthPct: 3,
    requiredReturnPct: 7.5,
    peLow: 12,
    peBase: 15,
    peHigh: 18,
  },
  tech: {
    primaryModel: "pe",
    growthPct: 18,
    terminalGrowthPct: 4,
    discountPct: 11,
    divGrowthPct: 6,
    requiredReturnPct: 11,
    peLow: 18,
    peBase: 26,
    peHigh: 35,
  },
  consumer: {
    primaryModel: "pe",
    growthPct: 10,
    terminalGrowthPct: 3.5,
    discountPct: 9.2,
    divGrowthPct: 5,
    requiredReturnPct: 9,
    peLow: 22,
    peBase: 28,
    peHigh: 34,
  },
  industrial: {
    primaryModel: "dcf",
    growthPct: 6,
    terminalGrowthPct: 3,
    discountPct: 9.2,
    divGrowthPct: 4,
    requiredReturnPct: 9.5,
    peLow: 11,
    peBase: 14,
    peHigh: 17,
  },
  general: {
    primaryModel: "dcf",
    growthPct: 6,
    terminalGrowthPct: 3,
    discountPct: 9.2,
    divGrowthPct: 4,
    requiredReturnPct: 9.5,
    peLow: 10,
    peBase: 14,
    peHigh: 18,
  },
};

export const SECTOR_ORDER: Sector[] = [
  "bank",
  "reit",
  "tech",
  "consumer",
  "industrial",
  "general",
];
