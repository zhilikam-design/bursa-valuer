/**
 * Bursa Malaysia fundamentals sync via the TradingView Malaysia Scanner API.
 *
 * A single POST to scanner.tradingview.com/malaysia/scan returns all 1,100+
 * listed counters (price, EPS, P/E, dividend yield, market cap, beta, sector,
 * shares outstanding) in one response — no scraping, no per-symbol requests.
 *
 * The dataset is keyed by TradingView ticker (e.g. "MAYBANK"), and for counters
 * whose 4-digit Bursa code we know (seed/aliases) an additional numeric-code
 * key is added, so the app resolves both "1155" and "MAYBANK".
 *
 * Data-quality policy: for the curated seed counters we prefer seed
 * fundamentals (beta, DPS, FCF, shares) since live sources are noisy for MY;
 * everything else comes straight from TradingView.
 *
 * Usage:
 *   npx tsx scripts/sync-bursa.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TICKER_ALIASES, normalizeSector } from "../lib/bursa";
import { SEED_MAP } from "../lib/data/seed";

const TV_SCAN_URL = "https://scanner.tradingview.com/malaysia/scan";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Content-Type": "application/json;charset=UTF-8",
  Accept: "application/json",
};

interface SyncedStock {
  code: string; // numeric Bursa code if known, else the ticker
  ticker: string; // `${code}.KL`
  name: string;
  nameZh: string;
  sector: string; // normalized Sector enum
  price: number;
  dps: number;
  eps: number | null;
  fcf: number | null; // RM millions
  fcfEstimated: boolean;
  shares: number | null; // millions
  beta: number;
  pe: number | null;
  dividendYieldPct: number;
  marketCap?: number; // RM absolute
  updatedAt: string;
}

/** Reverse map: ticker -> 4-digit code (from TICKER_ALIASES). */
const CODE_BY_TICKER: Record<string, string> = Object.fromEntries(
  Object.entries(TICKER_ALIASES).map(([ticker, code]) => [ticker, code]),
);

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}

function clampBeta(b: number | null): number {
  return b != null && isFinite(b) && b > 0.2 && b <= 2.5 ? b : 1.0;
}

function codeOfTicker(ticker: string): string {
  const t = ticker.toUpperCase();
  if (CODE_BY_TICKER[t]) return CODE_BY_TICKER[t];
  if (/^\d{4}$/.test(t)) return t;
  return t;
}

async function runTradingViewSync() {
  console.log("📡 Fetching complete Bursa Malaysia universe from TradingView Scanner API...");
  const payload = {
    filter: [],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
    columns: [
      "name", // 0: ticker (e.g. "MAYBANK")
      "description", // 1: company name
      "close", // 2: price
      "price_earnings_ttm", // 3: TTM P/E
      "earnings_per_share_basic_ttm", // 4: TTM EPS
      "dividend_yield_recent", // 5: dividend yield (%)
      "market_cap_basic", // 6: market cap (MYR)
      "sector", // 7: sector
      "beta_1_year", // 8: beta
      "total_shares_outstanding", // 9: shares outstanding
    ],
    sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
    range: [0, 1500],
  };

  const res = await fetch(TV_SCAN_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`TradingView API returned ${res.status} ${res.statusText}`);
  }
  const json: { data?: { s: string; d: unknown[] }[] } = await res.json();
  const rawList = json.data ?? [];
  console.log(`✅ Fetched ${rawList.length} Malaysian stocks from TradingView.`);

  const stocks: Record<string, SyncedStock> = {};
  for (const item of rawList) {
    const d = item.d;
    const rawTicker = String(d[0] ?? "").trim().toUpperCase();
    if (!rawTicker) continue;

    const description = String(d[1] ?? rawTicker);
    const close = num(d[2]);
    const pe = num(d[3]);
    const eps = num(d[4]);
    const divYield = num(d[5]); // percent, may be null
    const marketCap = num(d[6]);
    const tvSector = String(d[7] ?? "");
    const beta = num(d[8]);
    const totalShares = num(d[9]);

    const code = codeOfTicker(rawTicker);
    const seed = SEED_MAP[code] ?? null;

    const price = close != null && close > 0 ? close : seed?.price ?? 0;
    const cleanEps = seed?.eps ?? eps;
    const cleanPe = seed?.pe ?? (pe != null && pe > 0 ? pe : null);

    // DPS: seed (curated) → dividend yield × price → 0.
    let dps = seed?.dps ?? null;
    if (dps == null && divYield != null && divYield > 0 && price > 0) {
      dps = (divYield / 100) * price;
    }
    if (dps == null) dps = 0;

    const sharesAbs = totalShares;
    const shares =
      seed?.shares ??
      (sharesAbs != null && sharesAbs > 0
        ? sharesAbs / 1e6
        : marketCap != null && price > 0
          ? marketCap / price / 1e6
          : null);

    // FCF: curated seed → estimate from EPS × shares × 0.8.
    let fcf: number | null = null;
    let fcfEstimated = false;
    if (seed?.fcf != null && seed.fcf > 0) {
      fcf = seed.fcf;
    } else if (cleanEps != null && cleanEps > 0 && shares != null && shares > 0) {
      fcf = Number((cleanEps * shares * 0.8).toFixed(2));
      fcfEstimated = true;
    }

    const cleanBeta = seed?.beta ?? clampBeta(beta);
    const sector = seed?.sector ?? normalizeSector(tvSector);

    const record: SyncedStock = {
      code,
      ticker: `${code}.KL`,
      name: seed?.name ?? description,
      nameZh: seed?.nameZh ?? "",
      sector,
      price: Number(price.toFixed(3)),
      dps: Number(Number(dps).toFixed(4)),
      eps: cleanEps != null ? Number(cleanEps.toFixed(4)) : null,
      fcf: fcf != null ? Number(fcf.toFixed(2)) : null,
      fcfEstimated,
      shares: shares != null ? Number(shares.toFixed(2)) : null,
      beta: Number(cleanBeta.toFixed(3)),
      pe: cleanPe != null ? Number(cleanPe.toFixed(2)) : null,
      dividendYieldPct:
        divYield != null ? Number(divYield.toFixed(2)) : seed?.dividendYieldPct ?? 0,
      marketCap: marketCap != null ? Number(marketCap.toFixed(0)) : undefined,
      updatedAt: new Date().toISOString(),
    };

    // Primary key = ticker; add numeric-code alias when known.
    stocks[rawTicker] = record;
    if (code !== rawTicker) {
      stocks[code] = record;
    }
  }

  const outPath = join(process.cwd(), "lib", "data", "bursa-stocks.json");
  const output = {
    generatedAt: new Date().toISOString(),
    count: Object.keys(stocks).length,
    stocks,
  };
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n🎉 Sync complete! Saved ${output.count} entries to ${outPath}`);
}

runTradingViewSync().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
