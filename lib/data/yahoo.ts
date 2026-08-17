import { normalizeTicker, toBursaCode } from "@/lib/bursa";
import { SEED_MAP, type StockData, type StockSeed, type YahooQuote } from "./seed";

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
}

/**
 * Fetch trailing EPS / P/E / dividend yield from Yahoo's quoteSummary
 * endpoint. Returns null when the endpoint is unavailable (it is often
 * rate-limited without a crumb), in which case we fall back to seed or null.
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

    return {
      eps: typeof epsRaw === "number" && isFinite(epsRaw) ? epsRaw : null,
      pe: typeof peRaw === "number" && isFinite(peRaw) ? peRaw : null,
      dividendYieldPct:
        typeof divYieldRaw === "number" && isFinite(divYieldRaw)
          ? divYieldRaw * 100
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

  const yahoo = await fetchYahooQuote(rawTicker);
  const fin = await fetchYahooFinancials(rawTicker);
  if (yahoo) {
    const quote: YahooQuote = {
      ...yahoo,
      eps: fin?.eps ?? seed?.eps ?? null,
      pe: fin?.pe ?? seed?.pe ?? null,
      dividendYieldPct:
        fin?.dividendYieldPct ?? seed?.dividendYieldPct ?? 0,
    };
    return { ticker: yahoo.ticker, code, quote, seed, source: "yahoo" };
  }

  if (seed) {
    return {
      ticker: seed.ticker,
      code,
      quote: seedToQuote(seed),
      seed,
      source: "seed",
    };
  }

  // Unknown code and offline: still render with a generic profile so the
  // user can type manual inputs.
  const ticker = normalizeTicker(rawTicker);
  return {
    ticker,
    code,
    quote: {
      ticker,
      code,
      name: code,
      nameZh: code,
      price: 0,
      currency: "MYR",
      previousClose: 0,
      changePct: 0,
      marketCap: 0,
      eps: null,
      pe: null,
      dividendYieldPct: 0,
    },
    seed: null,
    source: "seed",
  };
}
