import type {
  DcfInputs,
  DcfResult,
  DdmInputs,
  DdmResult,
  ModelId,
  PeBandInputs,
  PeBandResult,
  Sector,
  ValuationResult,
} from "./types";
import { computeDcf } from "./dcf";
import { computeDdm } from "./ddm";
import { computePeBand } from "./pe-band";
import { SECTOR_PRESETS } from "@/lib/bursa";

export interface RunValuationInput {
  price: number;
  sector: Sector;
  dcf: DcfInputs;
  ddm: DdmInputs;
  pe: PeBandInputs;
}

/**
 * Run all three models and produce a unified result.
 * The "primary" model is selected by sector (banks/REITs -> DDM,
 * tech/consumer -> PE band, otherwise DCF), matching the BursaValuer
 * algorithm-modularization spec.
 */
export function runValuation(input: RunValuationInput): ValuationResult {
  const { price, sector, dcf, ddm, pe } = input;

  const dcfRes: DcfResult | null = computeDcf(dcf, price);
  const ddmRes: DdmResult | null = computeDdm(ddm, price);
  const peRes: PeBandResult | null = computePeBand(pe, price);

  // Preferred model order by sector; pick the first applicable one.
  const preferred = SECTOR_PRESETS[sector]?.primaryModel ?? "dcf";
  const order: ModelId[] =
    preferred === "ddm"
      ? ["ddm", "pe", "dcf"]
      : preferred === "pe"
        ? ["pe", "dcf", "ddm"]
        : ["dcf", "pe", "ddm"];

  const resultOf = (m: ModelId) =>
    m === "dcf" ? dcfRes : m === "ddm" ? ddmRes : peRes;

  let primary: ModelId = order[0];
  for (const m of order) {
    if (resultOf(m)?.applicable) {
      primary = m;
      break;
    }
  }

  const primaryResult = resultOf(primary);

  const primaryFairValue =
    primary === "dcf"
      ? dcfRes?.fairValuePerShare ?? 0
      : primary === "ddm"
        ? ddmRes?.fairValuePerShare ?? 0
        : peRes?.fairValueBase ?? 0;
  const primaryUpsidePct = primaryResult?.upsidePct ?? 0;

  // Blended: equal-weight only the applicable models.
  const values: number[] = [
    dcfRes?.applicable ? dcfRes.fairValuePerShare : undefined,
    ddmRes?.applicable ? ddmRes.fairValuePerShare : undefined,
    peRes?.applicable ? peRes.fairValueBase : undefined,
  ].filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0);

  const blendedFairValue =
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const verdict =
    primaryResult?.verdict ??
    (primaryUpsidePct >= 20 ? "buy" : primaryUpsidePct <= -10 ? "sell" : "hold");

  return {
    price,
    sector,
    dcf: dcfRes,
    ddm: ddmRes,
    pe: peRes,
    primary,
    primaryFairValue,
    primaryUpsidePct,
    verdict,
    blendedFairValue,
  };
}

export { computeDcf, dcfSensitivity } from "./dcf";
export { computeDdm, sustainableGrowth } from "./ddm";
export { computePeBand } from "./pe-band";
export { calculateDynamicDDM } from "./dynamic-ddm";
export { calculateDCFValuation, deriveSustainableGrowth } from "./dynamic-dcf";
export { verdictFromUpside, upsidePct, marginOfSafetyPct } from "./verdict";
export type {
  DDMFinancials,
  DDMResult as DynamicDDMResult,
} from "./dynamic-ddm";
export type {
  ValuationFinancials,
  DCFValuationResult,
  DCFProjectionYear,
} from "./dynamic-dcf";
export type {
  ModelId,
  Sector,
  Verdict,
  DcfInputs,
  DcfResult,
  DdmInputs,
  DdmResult,
  PeBandInputs,
  PeBandResult,
  ValuationResult,
} from "./types";
