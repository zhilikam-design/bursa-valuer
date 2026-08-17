import { normalizeTicker } from "@/lib/bursa";

/**
 * Financial Modeling Prep (FMP) — second data source for cross-validation.
 * Requires FMP_API_KEY (free tier: https://financialmodelingprep.com, 250 req/day).
 * Returns null when the key is missing or the request fails, so the app
 * degrades gracefully to Yahoo + seed.
 */

export interface FmpQuote {
  price: number | null;
  eps: number | null; // may be negative for loss-making counters
  pe: number | null; // null when EPS <= 0 or unknown
  marketCap: number | null; // RM
  dividendYieldPct: number | null; // percent points
  name: string | null;
}

export async function fetchFmpQuote(
  rawTicker: string,
): Promise<FmpQuote | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  const ticker = normalizeTicker(rawTicker); // e.g. 1155.KL
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(
    ticker,
  )}?apikey=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const item = Array.isArray(json) ? json[0] : null;
    if (!item) return null;

    const price =
      typeof item.price === "number" && isFinite(item.price) ? item.price : null;
    const eps =
      typeof item.eps === "number" && isFinite(item.eps) ? item.eps : null;
    const pe =
      typeof item.pe === "number" && isFinite(item.pe) && item.pe > 0
        ? item.pe
        : null;

    // FMP reports dividend yield inconsistently (fraction vs percent) — normalize.
    const rawYield = item.dividendYield;
    let dividendYieldPct: number | null = null;
    if (typeof rawYield === "number" && isFinite(rawYield) && rawYield >= 0) {
      dividendYieldPct = rawYield > 1 ? rawYield : rawYield * 100;
    }

    return {
      price,
      eps,
      pe,
      marketCap:
        typeof item.marketCap === "number" && isFinite(item.marketCap)
          ? item.marketCap
          : null,
      dividendYieldPct,
      name: typeof item.name === "string" ? item.name : null,
    };
  } catch {
    return null;
  }
}
