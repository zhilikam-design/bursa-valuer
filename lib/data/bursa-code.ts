// lib/data/bursa-code.ts
//
// Resolve Bursa Malaysia ticker names → 4-digit numeric codes (Yahoo format)
// via Yahoo Finance search.
//
// TradingView's scanner only returns ticker names (e.g. "MAYBANK", "TRIVE")
// while Yahoo only accepts numeric codes (e.g. "1155.KL"). For the stocks
// Yahoo indexes well (liquid names) search returns the numeric code; for
// illiquid / delisted names it fails and we fall back to the ticker name
// unchanged (TradingView-only coverage).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A numeric Bursa code: 4 digits + optional suffix letters (e.g. "5235SS"). */
export function isNumericCode(s: string): boolean {
  return /^\d{4}[A-Z]*$/i.test(s);
}

/** Known code from TICKER_ALIASES, or an already-numeric ticker. */
export function knownCode(
  ticker: string,
  codeByTicker: Record<string, string>,
): string | null {
  const t = ticker.toUpperCase();
  if (codeByTicker[t]) return codeByTicker[t];
  if (isNumericCode(t)) return t;
  return null;
}

/**
 * Resolve a ticker name to its numeric Bursa code via Yahoo search.
 * Falls back to the original ticker name when Yahoo doesn't index it.
 */
export async function resolveBursaCode(
  ticker: string,
  description: string,
  codeByTicker: Record<string, string>,
): Promise<string> {
  const known = knownCode(ticker, codeByTicker);
  if (known) return known;

  const t = ticker.toUpperCase();
  const queries = [t, description].filter((q) => q && q.trim().length > 0);

  for (const q of queries) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        q,
      )}&quotesCount=10&newsCount=0&listsCount=0`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        quotes?: {
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchDisp?: string;
        }[];
      };
      const kl = (json.quotes ?? []).filter((x) =>
        (x.symbol ?? "").toUpperCase().endsWith(".KL"),
      );
      if (kl.length === 0) continue;
      // Prefer exact shortname match, then a numeric symbol, then first result.
      const exact = kl.find((x) => (x.shortname ?? "").toUpperCase() === t);
      const numeric = kl.find((x) => isNumericCode((x.symbol ?? "").replace(/\.KL$/i, "")));
      const best = exact ?? numeric ?? kl[0];
      const code = (best.symbol ?? "").toUpperCase().replace(/\.KL$/i, "");
      if (isNumericCode(code)) return code;
    } catch {
      // try next query
    }
    await sleep(80); // be polite to Yahoo
  }
  return t; // fallback: keep ticker name
}

/** Map over items with a concurrency limit (keeps Yahoo rate-limit friendly). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
