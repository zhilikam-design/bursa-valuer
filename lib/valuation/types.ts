// ===========================================================================
// BursaValuer — valuation module types
//
// Zero-regression superset:
//  * Every legacy member / field used by the existing engines (dcf.ts, ddm.ts,
//    pe-band.ts, verdict.ts, index.ts), lib/valuation-engine.ts and the
//    interactive dashboard is PRESERVED (same names, same types).
//  * The new automated-valuation surface (sector presets, market assumptions,
//    pct-based inputs, beta/growth audits, projection rows) is layered on as
//    ADDITIVE optional fields so nothing existing breaks.
// ===========================================================================

export type Sector =
  | "bank"
  | "reit"
  | "utilities"
  | "tech"
  | "consumer"
  | "industrial"
  | "general";

export type ModelId = "dcf" | "ddm" | "pe";

/**
 * Legacy short verdicts ("buy" | "hold" | "sell") are used by the dashboard,
 * ModelComparisonCard and the i18n `verdict.*` dictionary, so they MUST remain
 * part of the type. The new human-readable labels are unioned in on top.
 */
export type Verdict =
  | "buy"
  | "hold"
  | "sell"
  | "Undervalued · Buy"
  | "Fairly Valued · Hold"
  | "Overvalued · Sell"
  | "N/A";

export interface SectorPreset {
  primaryModel: ModelId;
  growthPct: number; // FCF projection growth, percent points
  terminalGrowthPct: number; // terminal growth, percent points
  discountPct: number; // fallback WACC, percent points (overridden by CAPM)
  divGrowthPct: number; // DDM dividend growth, percent points
  requiredReturnPct: number; // cost of equity, percent points
  peLow: number;
  peBase: number;
  peHigh: number;
}

export interface MarketAssumptions {
  riskFreeRate: number;
  equityRiskPremium: number;
  corporateTaxRate: number;
  baselineDiscountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
}

/**
 * Superset of the legacy `{key, value, kind?}` row (kept intact so the
 * dashboard can keep rendering `t(row.key)` / formatMoney / formatPercent)
 * and the new display row (`label`, `subtext`, `isTotal`).
 */
export interface BreakdownRow {
  key: string; // i18n key (legacy, kept required)
  value: number; // must stay numeric so formatMoney/formatPercent keep working
  kind?: "money" | "percent"; // default "money"
  label?: string; // new: plain display label (used when no i18n key)
  subtext?: string; // new
  isTotal?: boolean; // new
}

// --- DCF ---
export interface DcfInputs {
  // legacy decimal inputs
  freeCashFlow: number; // RM millions, trailing
  growthRate: number; // decimal
  terminalGrowthRate: number; // decimal
  discountRate: number; // decimal (WACC)
  sharesOutstanding: number; // millions
  netDebt: number; // RM millions (debt - cash)
  projectionYears?: number; // default 5
  // new pct-based aliases (optional — engines may consume either form)
  growthPct?: number;
  terminalGrowthPct?: number;
  discountRatePct?: number;
}

export interface DcfProjection {
  year: number;
  growthRatePct: number;
  fcf: number;
  discountFactor: number;
  discountedFCF: number;
}

export interface DcfResult {
  // legacy (kept required — produced by computeDcf)
  model: "dcf";
  applicable: boolean; // false when FCF or shares outstanding missing
  reason?: string;
  warning?: string; // e.g. growth rate too close to discount rate
  cashFlows: number[];
  presentValues: number[];
  terminalValue: number;
  terminalValuePv: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  upsidePct: number;
  marginOfSafetyPct: number;
  verdict: Verdict;
  breakdown: BreakdownRow[];
  // new (optional — produced by dcf-engine / dynamic-dcf)
  fairValue?: number;
  intrinsicValuePerShare?: number;
  sumDiscountedFCF?: number;
  pvTerminalValue?: number;
  netDebt?: number;
  projections?: DcfProjection[];
}

// --- Gordon DDM ---
export interface DdmInputs {
  // legacy
  dividendPerShare: number; // RM, trailing
  dividendGrowthRate: number; // decimal
  requiredReturn: number; // decimal (cost of equity)
  payoutRatio?: number;
  roe?: number | null;
  // new (optional)
  divGrowthPct?: number;
  terminalGrowthPct?: number;
  requiredReturnPct?: number;
  sector?: Sector;
}

export interface DdmResult {
  // legacy (kept required — produced by computeDdm)
  model: "ddm";
  applicable: boolean; // false when no dividend data
  reason?: string;
  warning?: string; // e.g. growth rate too close to discount rate
  nextDps: number;
  fairValuePerShare: number;
  dividendYieldPct: number; // forward yield, decimal
  upsidePct: number;
  marginOfSafetyPct: number;
  verdict: Verdict;
  breakdown: BreakdownRow[];
  // new (optional)
  fairValue?: number;
  intrinsicValue?: number;
  derivedDivGrowthPct?: number;
  discountRatePct?: number;
  sumDiscountedDividends?: number;
  terminalValue?: number;
  pvTerminalValue?: number;
}

// --- Normalized PE Band ---
export interface PeBandInputs {
  // legacy
  normalizedEps: number; // RM
  peLow: number;
  peBase: number;
  peHigh: number;
  growthRate?: number; // decimal — forward EPS growth (EPS * (1 + g))
  // new (optional)
  eps?: number;
}

export interface PeBandResult {
  // legacy (kept required — produced by computePeBand)
  model: "pe";
  applicable: boolean; // false when normalized EPS <= 0 (loss-making)
  reason?: string; // why not applicable (loss-making)
  fairValueLow: number;
  fairValueBase: number;
  fairValueHigh: number;
  upsidePct: number; // vs base
  marginOfSafetyPct: number; // vs base
  verdict: Verdict;
  breakdown: BreakdownRow[];
  // new (optional)
  fairValue?: number;
  lowValue?: number;
  highValue?: number;
  peLow?: number;
  peBase?: number;
  peHigh?: number;
}

// --- Automated-valuation audit surfaces (new) ---
export interface BetaAudit {
  finalBeta: number;
  rawBeta: number | null;
  source: "quant_regression" | "sector_fallback";
  benchmark: string;
  blumeAdjusted: boolean;
  derivedDiscountRatePct: number;
}

export interface GrowthAudit {
  dcfGrowthPct: number;
  dcfGrowthSource: string;
  ddmGrowthPct: number;
  ddmGrowthSource: string;
  roePct: number | null;
  payoutRatioPct: number | null;
}

export interface ValuationMarketData {
  currentPrice: number;
  eps: number;
  peRatio: number;
  dps: number;
  dividendYieldPct: number;
  sharesOutstandingMil: number;
  freeCashFlowMil: number;
  netDebtMil: number;
  beta: number;
}

export interface ValuationModels {
  dcf: DcfResult | null;
  ddm: DdmResult | null;
  pe?: PeBandResult | null;
}

export interface ValuationResult {
  // legacy (kept required — produced by runValuation)
  price: number;
  sector: Sector;
  dcf: DcfResult | null;
  ddm: DdmResult | null;
  pe: PeBandResult | null;
  primary: ModelId;
  primaryFairValue: number;
  primaryUpsidePct: number;
  verdict: Verdict;
  blendedFairValue: number;
  // new (optional — populated by the automated /api/valuation pipeline)
  symbol?: string;
  companyName?: string;
  primaryModel?: ModelId;
  currentPrice?: number;
  fairValue?: number;
  upsidePct?: number;
  marginOfSafetyPct?: number;
  betaAudit?: BetaAudit;
  growthAudit?: GrowthAudit;
  marketData?: ValuationMarketData;
  models?: ValuationModels;
}
