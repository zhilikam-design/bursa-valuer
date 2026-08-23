// ===========================================================================
// Bursa Malaysia market constants, ticker utilities and sector presets.
// New consolidated home for everything previously exported by `lib/bursa.ts`
// (which is now a zero-regression re-export shim pointing back here) plus the
// new REIT ticker dictionary used by the automated valuation pipeline.
// ===========================================================================

import type { Sector, SectorPreset, MarketAssumptions } from "./types";

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

// --- Bursa REIT counters (resolved in `resolveSector` for DDM routing) ---
export const REIT_TICKERS: Record<string, string> = {
  YTLREIT: "5109",
  SUNREIT: "5176",
  SUNWAYREIT: "5176",
  AXREIT: "5106",
  PAVREIT: "5212",
  IGBREIT: "5227",
  KLCC: "5235SS",
  CMMT: "5180",
  KIPREIT: "5280",
  UOAREIT: "5110",
  TWRREIT: "5111",
  HEKTAR: "5121",
  AMFIRST: "5120",
  ARREIT: "5127",
  ALAQAR: "5116",
  ATRIUM: "7041",
  SENTRAL: "5123",
};

// --- Ticker aliases (common names resolve to Bursa .KL codes) ---
export const TICKER_ALIASES: Record<string, string> = {
  ...REIT_TICKERS,
  SUNWAY: "5211",
  OPPSTAR: "0275",
  MAYBANK: "1155",
  MBB: "1155",
  PBBANK: "1295",
  PUBLICBANK: "1295",
  CIMB: "1023",
  INARI: "0166",
  TENAGA: "5347",
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
  // Bursa codes are 4 digits with leading zeros (166 -> 0166.KL).
  const padded = /^\d+$/.test(code) ? code.padStart(4, "0") : code;
  return `${padded}.KL`;
}

/** Return the bare Bursa code ("1155.KL" -> "1155", "SUNREIT" -> "5176", "KLCC" -> "5235SS"). */
export function toBursaCode(input: string): string {
  return normalizeTicker(input).replace(/\.KL$/, "");
}

export function isBursaCode(input: string): boolean {
  return /^\d{4}[A-Z]*$/.test(toBursaCode(input));
}

/**
 * Sector presets. Routing rule:
 *   Financial Services / Real Estate / Utilities -> primary Gordon DDM.
 *   Everything else (Technology, Consumer, Industrial, General) -> primary DCF.
 */
export const SECTOR_PRESETS: Record<Sector, SectorPreset> = {
  bank: {
    primaryModel: "ddm",
    growthPct: 4.0,
    terminalGrowthPct: 2.0,
    discountPct: 8.5,
    divGrowthPct: 3.8,
    requiredReturnPct: 8.5,
    peLow: 9.5,
    peBase: 12.0,
    peHigh: 14.5,
  },
  reit: {
    primaryModel: "ddm",
    growthPct: 2.5,
    terminalGrowthPct: 2.0,
    discountPct: 6.75,
    divGrowthPct: 2.2,
    requiredReturnPct: 6.75,
    peLow: 12,
    peBase: 15,
    peHigh: 18,
  },
  utilities: {
    primaryModel: "ddm",
    growthPct: 3.0,
    terminalGrowthPct: 2.0,
    discountPct: 6.75,
    divGrowthPct: 2.5,
    requiredReturnPct: 6.75,
    peLow: 10,
    peBase: 13,
    peHigh: 16,
  },
  tech: {
    primaryModel: "dcf",
    growthPct: 9.5,
    terminalGrowthPct: 2.5,
    discountPct: 9.75,
    divGrowthPct: 3.0,
    requiredReturnPct: 9.75,
    peLow: 18,
    peBase: 25.0,
    peHigh: 32,
  },
  consumer: {
    primaryModel: "dcf",
    growthPct: 4.5,
    terminalGrowthPct: 2.5,
    discountPct: 8.5,
    divGrowthPct: 3.5,
    requiredReturnPct: 8.5,
    peLow: 20,
    peBase: 26,
    peHigh: 32,
  },
  industrial: {
    primaryModel: "dcf",
    growthPct: 4.0,
    terminalGrowthPct: 2.0,
    discountPct: 8.5,
    divGrowthPct: 3.0,
    requiredReturnPct: 8.5,
    peLow: 12,
    peBase: 16,
    peHigh: 20,
  },
  general: {
    primaryModel: "dcf",
    growthPct: 3.5,
    terminalGrowthPct: 2.0,
    discountPct: 8.5,
    divGrowthPct: 3.0,
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
  reit: "Real Estate Investment Trusts",
  utilities: "Utilities",
  tech: "Technology",
  consumer: "Consumer Products & Services",
  industrial: "Industrial Products & Energy",
  general: "General",
};

/** Map a raw Yahoo / seed sector string to our internal Sector enum. */
export function normalizeSector(raw: string | null | undefined): Sector {
  const s = (raw ?? "").toUpperCase();
  if (/(REAL\s*ESTATE|REIT|PROPERTY)/.test(s)) return "reit";
  if (/(FINANCIAL|BANK)/.test(s)) return "bank";
  if (/(UTILIT|POWER|WATER)/.test(s)) return "utilities";
  if (/(TECH|SEMICONDUCTOR|SOFTWARE|ELECTRONIC)/.test(s)) return "tech";
  if (/(CONSUMER|FOOD|BEVERAGE|RETAIL)/.test(s)) return "consumer";
  if (/(INDUSTRIAL|MANUFACTUR|GLOVE|HEALTH|ENERGY|OIL|GAS)/.test(s)) return "industrial";
  return "general";
}
