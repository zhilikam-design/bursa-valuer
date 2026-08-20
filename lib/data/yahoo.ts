import { normalizeTicker, toBursaCode, SECTOR_LABEL } from "@/lib/bursa";
import {
  SEED_MAP,
  type FinancialDataQuality,
  type Financials,
  type StockData,
  type StockSeed,
  type YahooQuote,
} from "./seed";
import { fetchFmpQuote } from "./fmp";
import { agreementOf, pickMedian } from "./arbitrate";

/**
 * Server-side market-data fetch for Bursa Malaysia counters.
 * Primary source is the official `yahoo-finance2` package (avoids raw-fetch
 * IP blocks / 401 / 429 on Vercel), with a raw-fetch fallback and then the
 * bundled seed map, so the valuation UI always renders.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Primary: yahoo-finance2
// ---------------------------------------------------------------------------

interface LiveFundamentals {
  price: number | null;
  marketCap: number | null; // RM absolute
  eps: number | null;
  pe: number | null;
  dividendYieldPct: number | null; // percent points
  dps: number | null; // RM
  sharesOutstanding: number | null; // millions
  beta: number | null;
  fcf: number | null; // RM millions
  sector: string | null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (
    v &&
    typeof (v as { raw?: unknown }).raw === "number" &&
    isFinite((v as { raw: number }).raw)
  ) {
    return (v as { raw: number }).raw;
  }
  return null;
}

async function fetchViaYahooFinance2(
  rawTicker: string,
): Promise<LiveFundamentals | null> {
  const ticker = normalizeTicker(rawTicker);
  try {
    const mod = (await import("yahoo-finance2")) as {
      default?: unknown;
    };
    const yahooFinance = mod.default ?? mod;
    const qs = await (yahooFinance as {
      quoteSummary: (
        symbol: string,
        opts: { modules: string[] },
      ) => Promise<Record<string, unknown>>;
    }).quoteSummary(ticker, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "assetProfile",
      ],
    });
    if (!qs) return null;

    const price = num((qs.price as Record<string, unknown>)?.regularMarketPrice)
      ?? num((qs.financialData as Record<string, unknown>)?.currentPrice);
    const marketCap = num((qs.price as Record<string, unknown>)?.marketCap)
      ?? num((qs.summaryDetail as Record<string, unknown>)?.marketCap)
      ?? num((qs.defaultKeyStatistics as Record<string, unknown>)?.marketCap);
    const eps = num((qs.defaultKeyStatistics as Record<string, unknown>)?.trailingEps);
    const pe = num((qs.summaryDetail as Record<string, unknown>)?.trailingPE);
    const divYield = num((qs.summaryDetail as Record<string, unknown>)?.dividendYield);
    const trailingAnnualDiv = num(
      (qs.summaryDetail as Record<string, unknown>)?.trailingAnnualDividendRate,
    );
    const divRate = num((qs.summaryDetail as Record<string, unknown>)?.dividendRate);
    const statsYield = num((qs.defaultKeyStatistics as Record<string, unknown>)?.yield);

    // DPS multi-key fallback (crucial for REITs):
    // trailing annual dividend > dividend rate > yield × price > stats yield × price
    let dps: number | null = trailingAnnualDiv ?? divRate ?? null;
    if (dps == null && divYield != null && price != null && price > 0) {
      dps = divYield * price;
    }
    if (dps == null && statsYield != null && price != null && price > 0) {
      dps = statsYield * price;
    }

    const sharesAbs = num(
      (qs.defaultKeyStatistics as Record<string, unknown>)?.sharesOutstanding,
    );
    const beta = num((qs.defaultKeyStatistics as Record<string, unknown>)?.beta);
    const fcfAbs =
      num((qs.financialData as Record<string, unknown>)?.freeCashflow)
      ?? num((qs.defaultKeyStatistics as Record<string, unknown>)?.freeCashflow);

    const sectorVal = (qs.assetProfile as Record<string, unknown>)?.sector;

    return {
      price,
      marketCap,
      eps,
      pe,
      dividendYieldPct: divYield != null ? divYield * 100 : null,
      dps,
      sharesOutstanding:
        sharesAbs != null && sharesAbs > 0 ? sharesAbs / 1e6 : null,
      beta,
      fcf: fcfAbs != null && isFinite(fcfAbs) ? fcfAbs / 1e6 : null,
      sector: typeof sectorVal === "string" ? sectorVal : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback 1: raw Yahoo chart (price only)
// ---------------------------------------------------------------------------

export async function fetchYahooQuote(
  rawTicker: string,
  fresh = false,
): Promise<YahooQuote | null> {
  const ticker = normalizeTicker(rawTicker);
  const code = toBursaCode(rawTicker);
  const seed = SEED_MAP[code] ?? null;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?interval=1d&range=5d`;

  try {
    const res = fresh
      ? await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          cache: "no-store",
        })
      : await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          next: { revalidate: 60 },
        });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? meta.previousClose;
    if (typeof price !== "number" || !isFinite(price) || price <= 0) return null;

    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const changePct =
      previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

    return {
      ticker,
      code,
      name: seed?.name ?? meta.shortName ?? meta.longName ?? code,
      nameZh: seed?.nameZh ?? seed?.name ?? code,
      price,
      currency: meta.currency ?? "MYR",
      previousClose,
      changePct,
      marketCap: typeof meta.marketCap === "number" ? meta.marketCap : 0,
      eps: null,
      pe: null,
      dividendYieldPct: seed?.dividendYieldPct ?? 0,
      sector: seed ? SECTOR_LABEL[seed.sector] : null,
      beta: seed?.beta ?? 1,
      dps: seed?.dps ?? null,
      fcf: null,
      shares: null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback 2: raw Yahoo quoteSummary (fundamentals)
// ---------------------------------------------------------------------------

export interface YahooFinancials {
  eps: number | null;
  pe: number | null;
  dividendYieldPct: number | null;
  sharesOutstanding: number | null; // millions
}

export async function fetchYahooFinancials(
  rawTicker: string,
): Promise<YahooFinancials | null> {
  const ticker = normalizeTicker(rawTicker);
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker,
  )}?modules=summaryDetail,defaultKeyStatistics`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;

    const stats = result.defaultKeyStatistics ?? {};
    const detail = result.summaryDetail ?? {};

    const epsRaw = stats.trailingEps?.raw;
    const peRaw = detail.trailingPE?.raw;
    const divYieldRaw = detail.dividendYield?.raw;
    const sharesRaw = stats.sharesOutstanding?.raw;

    return {
      eps: typeof epsRaw === "number" && isFinite(epsRaw) ? epsRaw : null,
      pe: typeof peRaw === "number" && isFinite(peRaw) ? peRaw : null,
      dividendYieldPct:
        typeof divYieldRaw === "number" && isFinite(divYieldRaw)
          ? divYieldRaw * 100
          : null,
      sharesOutstanding:
        typeof sharesRaw === "number" && isFinite(sharesRaw) && sharesRaw > 0
          ? sharesRaw / 1e6
          : null,
    };
  } catch {
    return null;
  }
}

function seedToQuote(seed: StockSeed): YahooQuote {
  return {
    ticker: seed.ticker,
    code: seed.code,
    name: seed.name,
    nameZh: seed.nameZh,
    price: seed.price,
    currency: "MYR",
    previousClose: seed.price,
    changePct: 0,
    marketCap: seed.price * seed.shares * 1e6,
    eps: seed.eps,
    pe: seed.pe,
    dividendYieldPct: seed.dividendYieldPct,
    sector: SECTOR_LABEL[seed.sector],
    beta: seed.beta,
    dps: seed.dps,
    fcf: seed.fcf > 0 ? seed.fcf : null,
    shares: seed.shares,
  };
}

// ---------------------------------------------------------------------------
// Orchestration with robust fallback chain
// ---------------------------------------------------------------------------

export async function getStockData(rawTicker: string): Promise<StockData> {
  const code = toBursaCode(rawTicker);
  const seed = SEED_MAP[code] ?? null;
  const ticker = normalizeTicker(rawTicker);

  const [vf2, yahoo, fin, fmp] = await Promise.all([
    fetchViaYahooFinance2(rawTicker),
    fetchYahooQuote(rawTicker),
    fetchYahooFinancials(rawTicker),
    fetchFmpQuote(rawTicker),
  ]);

  const dataSources = {
    yahoo: !!(yahoo || vf2),
    fmp: !!fmp,
    seed: !!seed,
  };

  // Cross-source arbitration: median of whatever contributed.
  const eps = pickMedian([vf2?.eps, fin?.eps, fmp?.eps, seed?.eps]);
  const epsAgreement = agreementOf([vf2?.eps, fin?.eps, fmp?.eps, seed?.eps]);
  const pe = pickMedian([vf2?.pe, fin?.pe, fmp?.pe, seed?.pe]);
  const dividendYieldPct =
    pickMedian([
      vf2?.dividendYieldPct,
      fin?.dividendYieldPct,
      fmp?.dividendYieldPct,
      seed?.dividendYieldPct,
    ]) ?? 0;

  const price = vf2?.price ?? yahoo?.price ?? fmp?.price ?? seed?.price ?? 0;
  const marketCap =
    vf2?.marketCap ?? fmp?.marketCap ?? yahoo?.marketCap ?? 0;
  const beta = vf2?.beta ?? seed?.beta ?? 1;
  const sectorLabel = seed ? SECTOR_LABEL[seed.sector] : vf2?.sector ?? null;

  // Shares outstanding (millions); derive from marketCap / price if missing.
  let sharesM: number | null =
    seed?.shares ?? vf2?.sharesOutstanding ?? fin?.sharesOutstanding ?? null;
  if ((sharesM == null || sharesM <= 0) && marketCap > 0 && price > 0) {
    sharesM = marketCap / price / 1e6;
  }

  // FCF (RM millions). Known seeds with fcf=0 mean "no FCF available" (banks).
  let fcf: number | null = null;
  let quality: FinancialDataQuality = "insufficient";
  const liveFcf = vf2?.fcf ?? null;
  if (seed) {
    if (seed.fcf > 0) {
      fcf = seed.fcf;
      quality = "seed";
    } else if (liveFcf != null && liveFcf > 0) {
      fcf = liveFcf;
      quality = "live";
    }
  } else {
    if (liveFcf != null && liveFcf > 0) {
      fcf = liveFcf;
      quality = "live";
    } else if (eps != null && eps > 0 && sharesM != null && sharesM > 0) {
      // Estimate base FCF ≈ 80% of net profit (EPS × shares outstanding).
      fcf = Number((eps * sharesM * 0.8).toFixed(2));
      quality = "estimated";
    }
  }

  // DPS multi-key: live DPS > seed DPS > dividend yield × price.
  let dps: number | null = vf2?.dps ?? seed?.dps ?? null;
  if ((dps == null || dps <= 0) && dividendYieldPct > 0 && price > 0) {
    dps = Number(((dividendYieldPct / 100) * price).toFixed(4));
  }

  const source: StockData["source"] =
    yahoo || vf2 ? "yahoo" : fmp ? "fmp" : "seed";

  const quote: YahooQuote = {
    ticker,
    code,
    name: seed?.name ?? fmp?.name ?? yahoo?.name ?? vf2?.sector ?? code,
    nameZh: seed?.nameZh ?? seed?.name ?? code,
    price,
    currency: yahoo?.currency ?? "MYR",
    previousClose: yahoo?.previousClose ?? price,
    changePct: yahoo?.changePct ?? 0,
    marketCap,
    eps,
    pe,
    dividendYieldPct,
    sector: sectorLabel,
    beta,
    dps,
    fcf,
    shares: sharesM,
  };

  const financials: Financials = {
    eps,
    pe,
    dividendYieldPct: dividendYieldPct > 0 ? dividendYieldPct : null,
    dps,
    fcf,
    sharesOutstanding: sharesM,
    netDebt: seed?.netDebt ?? 0,
    quality,
    isFallback: quality === "seed" || quality === "estimated",
    insufficientDcf:
      fcf == null || sharesM == null || fcf <= 0 || sharesM <= 0,
    insufficientDdm: dps == null || dps <= 0,
  };

  return {
    ticker,
    code,
    quote,
    seed,
    financials,
    source,
    dataSources,
    epsAgreement,
  };
}
