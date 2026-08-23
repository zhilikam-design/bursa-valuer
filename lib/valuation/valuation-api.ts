// ===========================================================================
// Automated Bursa Malaysia valuation — core computation.
//
// Shared by the `/api/valuation` route (thin HTTP wrapper in app/api/).
// Kept out of the route file because Next.js only permits a whitelist of
// exports from route modules.
//
// Data pipeline:
//   1. getStockData() — canonical synced/seed/live source (price, EPS, PE,
//      DPS, FCF, shares, net debt, beta, sector). Proven by scripts/verify.
//   2. yahoo-finance2 enrichment — ROE / payout ratio for endogenous growth
//      derivation (best-effort; raw v10 quoteSummary fetch is blocked by
//      Yahoo without a cookie+crumb, so we use the crumb-aware package).
//   3. getAccurateBursaBeta() — ^KLSE regression + Blume + sector fallback.
//   4. Dynamic DCF + DDM engines.
// ===========================================================================

import {
  normalizeTicker,
  SECTOR_PRESETS,
  deriveDiscountRate,
} from "@/lib/valuation/bursa-ticker";
import { getAccurateBursaBeta } from "@/lib/valuation/bursa-beta";
import {
  resolveSector,
  extractRawNumber,
} from "@/lib/valuation/balance-sheet-cleaner";
import { calculateDCFValuation } from "@/lib/valuation/dcf-engine";
import { calculateDynamicDDM } from "@/lib/valuation/ddm-engine";
import { getStockData } from "@/lib/data/yahoo";
import type { Sector } from "@/lib/valuation/types";

/** Best-effort ROE / payout enrichment via the crumb-aware yahoo-finance2 pkg. */
async function enrichFundamentals(ticker: string) {
  try {
    const mod = (await import("yahoo-finance2")) as {
      default?: new (options?: unknown) => unknown;
    };
    const Ctor = mod.default;
    if (typeof Ctor !== "function") return null;
    const yahooFinance = new Ctor() as {
      quoteSummary: (
        symbol: string,
        opts: { modules?: string[] },
      ) => Promise<Record<string, unknown>>;
    };
    return await yahooFinance.quoteSummary(ticker, {
      modules: ["financialData", "summaryDetail"],
    });
  } catch {
    return null;
  }
}

export async function computeValuation(tickerInput: string) {
  const symbol = normalizeTicker(tickerInput);
  if (!symbol) return { error: "Invalid ticker" };

  const data = await getStockData(symbol);
  const q = data.quote;
  if (!q || q.price <= 0) return { error: "Stock not found" };

  const sector: Sector =
    data.seed?.sector ?? resolveSector(symbol, q.name ?? "", q.sector ?? "");
  const preset = SECTOR_PRESETS[sector] ?? SECTOR_PRESETS.general;

  const currentPrice = q.price;
  const eps = q.eps ?? 0;
  const peRatio = q.pe ?? (eps > 0 ? currentPrice / eps : 0);
  const dps = q.dps ?? 0;
  const fcfMil = q.fcf ?? 0; // RM millions (canonical app convention)
  const sharesMil = q.shares ?? 0; // millions
  const netDebtMil = data.financials.netDebt ?? 0; // RM millions

  // Enrichment: ROE / payout for endogenous growth (nullable → sector preset).
  const enriched = await enrichFundamentals(symbol);
  const roe = enriched ? extractRawNumber((enriched.financialData as any)?.returnOnEquity) : 0;
  const payoutRatio = enriched ? extractRawNumber((enriched.summaryDetail as any)?.payoutRatio) : 0;

  // Accurate beta + audit (regression → Blume → sector fallback).
  const betaAuditRaw = await getAccurateBursaBeta(symbol, sector);
  const beta = betaAuditRaw.beta;
  const discountRate = deriveDiscountRate(beta);

  const dcfResult =
    fcfMil > 0 && sharesMil > 0
      ? calculateDCFValuation({
          symbol,
          currentPrice,
          sharesOutstanding: sharesMil,
          freeCashFlow: fcfMil,
          totalDebt: netDebtMil,
          cashAndEquivalents: 0,
          roe,
          payoutRatio,
          beta,
          sector,
        })
      : null;

  const ddmResult =
    dps > 0
      ? calculateDynamicDDM({
          symbol,
          currentPrice,
          dividendPerShare: dps,
          roe,
          payoutRatio,
          beta,
          sector,
        })
      : null;

  return {
    symbol,
    companyName: q.nameZh || q.name,
    sector,
    primaryModel: preset.primaryModel,
    betaAudit: {
      finalBeta: Number(beta.toFixed(2)),
      rawBeta: betaAuditRaw.rawCalculatedBeta ?? null,
      source: betaAuditRaw.source,
      benchmark: "^KLSE",
      blumeAdjusted: betaAuditRaw.source === "quant_regression",
      derivedDiscountRatePct: Number((discountRate * 100).toFixed(2)),
    },
    growthAudit: {
      dcfGrowthPct: dcfResult
        ? Number((dcfResult.derivedGrowthRate * 100).toFixed(2))
        : preset.growthPct,
      dcfGrowthSource: dcfResult ? dcfResult.growthSource : "sector_preset",
      ddmGrowthPct: ddmResult ? ddmResult.derivedDivGrowth : preset.divGrowthPct,
      ddmGrowthSource: sector === "bank" && roe > 0 ? "roe_retention" : "sector_preset",
      roePct: roe > 0 ? Number((roe * 100).toFixed(2)) : null,
      payoutRatioPct: payoutRatio > 0 ? Number((payoutRatio * 100).toFixed(2)) : null,
    },
    marketData: {
      currentPrice,
      eps,
      peRatio,
      dps,
      dividendYieldPct:
        currentPrice > 0 ? Number(((dps / currentPrice) * 100).toFixed(2)) : 0,
      sharesOutstandingMil: Number(sharesMil.toFixed(2)),
      freeCashFlowMil: Number(fcfMil.toFixed(2)),
      netDebtMil: Number(netDebtMil.toFixed(2)),
      beta: Number(beta.toFixed(2)),
    },
    models: { dcf: dcfResult, ddm: ddmResult },
  };
}
