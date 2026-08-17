import {
  SEED_MAP,
  type FinancialDataQuality,
  type Financials,
  type StockData,
  type StockSeed,
  type YahooQuote,
} from "./seed";
import { normalizeTicker, toBursaCode } from "@/lib/bursa";
import { fetchFmpQuote } from "./fmp";
import { agreementOf, pickMedian } from "./arbitrate";

/**
 * Server-side Yahoo Finance fetch for Bursa Malaysia counters.
 * Uses the public chart endpoint (no API key / crumb required).
 * Falls back to bundled demo defaults when the network call fails,
 * so the valuation UI always renders.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

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
    };
  } catch {
    return null;
  }
}

export interface YahooFinancials {
  eps: number | null; // may be negative for loss-making counters
  pe: number | null; // null when EPS <= 0 or unknown
  dividendYieldPct: number | null; // percent points
  sharesOutstanding: number | null; // millions
}

/**
 * Fetch trailing EPS / P/E / dividend yield / shares outstanding from
 * Yahoo's quoteSummary endpoint. Returns null when the endpoint is
 * unavailable (often rate-limited without a crumb).
 */
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
    const divYieldRaw = detail.dividendYield?.raw; // fraction, e.g. 0.059
    const sharesRaw = stats.sharesOutstanding?.raw; // absolute count

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
  };
}

export async function getStockData(rawTicker: string): Promise<StockData> {
  const code = toBursaCode(rawTicker);
  const seed = SEED_MAP[code] ?? null;
  const ticker = normalizeTicker(rawTicker);

  const [yahoo, fin, fmp] = await Promise.all([
    fetchYahooQuote(rawTicker),
    fetchYahooFinancials(rawTicker),
    fetchFmpQuote(rawTicker),
  ]);

  const dataSources = { yahoo: !!yahoo, fmp: !!fmp, seed: !!seed };

  // Cross-source arbitration: median of whatever contributed, with an
  // agreement flag for the UI to surface data-quality.
  const eps = pickMedian([fin?.eps, fmp?.eps, seed?.eps]);
  const epsAgreement = agreementOf([fin?.eps, fmp?.eps, seed?.eps]);
  const pe = pickMedian([fin?.pe, fmp?.pe, seed?.pe]);
  const dividendYieldPct =
    pickMedian([
      fin?.dividendYieldPct,
      fmp?.dividendYieldPct,
      seed?.dividendYieldPct,
    ]) ?? 0;

  const price = yahoo?.price ?? fmp?.price ?? seed?.price ?? 0;
  const source: StockData["source"] = yahoo ? "yahoo" : fmp ? "fmp" : "seed";

  const quote: YahooQuote = {
    ticker,
    code,
    name: seed?.name ?? fmp?.name ?? yahoo?.name ?? code,
    nameZh: seed?.nameZh ?? seed?.name ?? code,
    price,
    currency: yahoo?.currency ?? "MYR",
    previousClose: yahoo?.previousClose ?? price,
    changePct: yahoo?.changePct ?? 0,
    marketCap: fmp?.marketCap ?? yahoo?.marketCap ?? 0,
    eps,
    pe,
    dividendYieldPct,
  };

  // --- Resolve DCF/DDM inputs (never fabricate dummy defaults) ---
  const sharesM = seed?.shares ?? fin?.sharesOutstanding ?? null;

  let fcf: number | null = null;
  let quality: FinancialDataQuality = "insufficient";
  if (seed?.fcf != null && seed.fcf > 0) {
    fcf = seed.fcf;
    quality = "seed";
  } else if (eps != null && eps > 0 && sharesM != null && sharesM > 0) {
    // Estimate base FCF ≈ 80% of net profit (EPS × shares outstanding).
    fcf = Number((eps * sharesM * 0.8).toFixed(2));
    quality = "estimated";
  }

  let dps: number | null = seed?.dps ?? null;
  if (dps == null && dividendYieldPct > 0 && price > 0) {
    dps = Number(((dividendYieldPct / 100) * price).toFixed(4));
  }

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
