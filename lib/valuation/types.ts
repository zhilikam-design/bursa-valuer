export type Sector =
  | "bank"
  | "reit"
  | "tech"
  | "consumer"
  | "industrial"
  | "general";

export type ModelId = "dcf" | "ddm" | "pe";
export type Verdict = "buy" | "hold" | "sell";

export interface BreakdownRow {
  key: string; // i18n key
  value: number;
  kind?: "money" | "percent"; // default "money"
}

// --- DCF ---
export interface DcfInputs {
  freeCashFlow: number; // RM millions, trailing
  growthRate: number; // decimal
  terminalGrowthRate: number; // decimal
  discountRate: number; // decimal (WACC)
  sharesOutstanding: number; // millions
  netDebt: number; // RM millions (debt - cash)
  projectionYears?: number; // default 5
}

export interface DcfResult {
  model: "dcf";
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
}

// --- Gordon DDM ---
export interface DdmInputs {
  dividendPerShare: number; // RM, trailing
  dividendGrowthRate: number; // decimal
  requiredReturn: number; // decimal (cost of equity)
  payoutRatio?: number; // optional
  roe?: number; // optional
}

export interface DdmResult {
  model: "ddm";
  nextDps: number;
  fairValuePerShare: number;
  dividendYieldPct: number; // forward yield, decimal
  upsidePct: number;
  marginOfSafetyPct: number;
  verdict: Verdict;
  breakdown: BreakdownRow[];
}

// --- Normalized PE Band ---
export interface PeBandInputs {
  normalizedEps: number; // RM
  peLow: number;
  peBase: number;
  peHigh: number;
}

export interface PeBandResult {
  model: "pe";
  fairValueLow: number;
  fairValueBase: number;
  fairValueHigh: number;
  upsidePct: number; // vs base
  marginOfSafetyPct: number; // vs base
  verdict: Verdict;
  breakdown: BreakdownRow[];
}

export interface ValuationResult {
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
}
