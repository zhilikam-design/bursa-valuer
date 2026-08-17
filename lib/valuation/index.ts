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

  let primary: ModelId = SECTOR_PRESETS[sector]?.primaryModel ?? "dcf";
  // PE band is meaningless for loss-making counters (EPS <= 0) — fall back to DCF.
  if (primary === "pe" && peRes && !peRes.applicable) {
    primary = dcfRes ? "dcf" : "ddm";
  }

  const primaryResult =
    primary === "dcf" ? dcfRes : primary === "ddm" ? ddmRes : peRes;

  const primaryFairValue =
    primary === "dcf"
      ? dcfRes?.fairValuePerShare ?? 0
      : primary === "ddm"
        ? ddmRes?.fairValuePerShare ?? 0
        : peRes?.fairValueBase ?? 0;
  const primaryUpsidePct = primaryResult?.upsidePct ?? 0;

  // Blended: equal-weight the three model fair values (whichever are valid)
  const values: number[] = [
    dcfRes?.fairValuePerShare,
    ddmRes?.fairValuePerShare,
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
export { verdictFromUpside, upsidePct, marginOfSafetyPct } from "./verdict";
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
