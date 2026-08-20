import type { Sector } from "@/lib/valuation/types";

export const CURRENCY = "MYR";
export const CURRENCY_SYMBOL = "RM";

// --- Bursa Malaysia market defaults ---
export const RISK_FREE_RATE = 0.035; // Malaysia 10Y MGS yield
export const EQUITY_RISK_PREMIUM = 0.05; // market equity risk premium
export const MIN_DISCOUNT_RATE = 0.06; // CAPM floor
export const BASELINE_DISCOUNT_RATE = RISK_FREE_RATE + EQUITY_RISK_PREMIUM; // 8.5% at beta = 1
export const CORPORATE_TAX_RATE = 0.24;
export const DEFAULT_GROWTH_RATE = 0.02; // stable/perpetual + DDM dividend growth default
export const TERMINAL_GROWTH_RATE = 0.02;
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
  riskFreeRate: RISK_FREE_RATE,
  equityRiskPremium: EQUITY_RISK_PREMIUM,
  corporateTaxRate: CORPORATE_TAX_RATE,
  baselineDiscountRate: BASELINE_DISCOUNT_RATE,
  terminalGrowthRate: TERMINAL_GROWTH_RATE,
  projectionYears: PROJECTION_YEARS,
};

/**
 * Dynamic CAPM discount rate:
 *   r = Rf + (beta × ERP), clamped to a minimum of 6.0%.
 */
export function deriveDiscountRate(beta: number): number {
  const b = isFinite(beta) && beta > 0 ? beta : 1;
  return Math.max(RISK_FREE_RATE + b * EQUITY_RISK_PREMIUM, MIN_DISCOUNT_RATE);
}

// --- Ticker aliases (common names resolve to Bursa .KL codes) ---
export const TICKER_ALIASES: Record<string, string> = {
  SUNREIT: "5176",
  SUNWAYREIT: "5176",
  SUNWAY: "5176",
  OPPSTAR: "0275",
  MAYBANK: "1155",
  PBBANK: "1295",
  PUBLICBANK: "1295",
  TENAGA: "5347",
  INARI: "0166",
  CIMB: "1023",
  NESTLE: "4707",
  TOPGLOVE: "7113",
  TOPGLOV: "7113",
};

/**
 * Normalize any Bursa ticker input into Yahoo-style "NNNN.KL".
 * Accepts "1155", "0166", "1155.KL", "klse:1155", "MAYBANK", "SUNREIT", etc.
 */
export function normalizeTicker(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  if (TICKER_ALIASES[cleaned]) return `${TICKER_ALIASES[cleaned]}.KL`;
  const code = cleaned
    .replace(/^KLSE:/, "")
    .replace(/\.KL$/, "")
    .replace(/^\./, "");
  return `${code}.KL`;
}

/** Return the bare 4-digit Bursa code ("1155.KL" -> "1155", "SUNREIT" -> "5176"). */
export function toBursaCode(input: string): string {
  return normalizeTicker(input).replace(/\.KL$/, "");
}

export function isBursaCode(input: string): boolean {
  return /^\d{4}$/.test(toBursaCode(input));
}

export type ModelId = "dcf" | "ddm" | "pe";

export interface SectorPreset {
  primaryModel: ModelId;
  growthPct: number; // FCF projection growth, percent points
  terminalGrowthPct: number;
  discountPct: number; // fallback WACC, percent points (overridden by CAPM)
  divGrowthPct: number;
  requiredReturnPct: number;
  peLow: number;
  peBase: number;
  peHigh: number;
}

/**
 * Sector presets. Routing rule:
 *   Financial Services / Utilities / Real Estate -> primary Gordon DDM.
 *   Everything else (Technology, Consumer, Industrial, General) -> primary DCF.
 */
export const SECTOR_PRESETS: Record<Sector, SectorPreset> = {
  bank: {
    primaryModel: "ddm",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 8.5,
    divGrowthPct: 2,
    requiredReturnPct: 8.5,
    peLow: 10,
    peBase: 13,
    peHigh: 16,
  },
  reit: {
    primaryModel: "ddm",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 6.75,
    divGrowthPct: 2,
    requiredReturnPct: 6.75,
    peLow: 12,
    peBase: 15,
    peHigh: 18,
  },
  utilities: {
    primaryModel: "ddm",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 6.75,
    divGrowthPct: 2,
    requiredReturnPct: 6.75,
    peLow: 10,
    peBase: 13,
    peHigh: 16,
  },
  tech: {
    primaryModel: "dcf",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 9.75,
    divGrowthPct: 2,
    requiredReturnPct: 9.75,
    peLow: 18,
    peBase: 26,
    peHigh: 35,
  },
  consumer: {
    primaryModel: "dcf",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 8.5,
    divGrowthPct: 2,
    requiredReturnPct: 8.5,
    peLow: 22,
    peBase: 28,
    peHigh: 34,
  },
  industrial: {
    primaryModel: "dcf",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 8.5,
    divGrowthPct: 2,
    requiredReturnPct: 8.5,
    peLow: 11,
    peBase: 14,
    peHigh: 17,
  },
  general: {
    primaryModel: "dcf",
    growthPct: 2,
    terminalGrowthPct: 2,
    discountPct: 8.5,
    divGrowthPct: 2,
    requiredReturnPct: 8.5,
    peLow: 10,
    peBase: 14,
    peHigh: 18,
  },
};

/** Sectors where Gordon DDM is the primary model. */
export const DDM_SECTORS: Sector[] = ["bank", "reit", "utilities"];

export const SECTOR_ORDER: Sector[] = [
  "bank",
  "reit",
  "utilities",
  "tech",
  "consumer",
  "industrial",
  "general",
];

/** Display labels for raw sector strings (used for quote.sector). */
export const SECTOR_LABEL: Record<Sector, string> = {
  bank: "Financial Services",
  reit: "Real Estate",
  utilities: "Utilities",
  tech: "Technology",
  consumer: "Consumer",
  industrial: "Industrial",
  general: "General",
};

/** Map a raw Yahoo / seed sector string to our internal Sector enum. */
export function normalizeSector(raw: string | null | undefined): Sector {
  const s = (raw ?? "").toUpperCase();
  if (/(REAL\s*ESTATE|REIT|PROPERTY)/.test(s)) return "reit";
  if (/(FINANCIAL|BANK)/.test(s)) return "bank";
  if (/(UTILIT|ENERGY|POWER)/.test(s)) return "utilities";
  if (/(TECH|SEMICONDUCTOR|SOFTWARE|ELECTRONIC)/.test(s)) return "tech";
  if (/(CONSUMER|FOOD|BEVERAGE|RETAIL)/.test(s)) return "consumer";
  if (/(INDUSTRIAL|MANUFACTUR|GLOVE|HEALTH)/.test(s)) return "industrial";
  return "general";
}
