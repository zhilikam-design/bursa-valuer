// ===========================================================================
// Balance-sheet / fundamentals cleaners for the automated /api/valuation
// pipeline. Extracts defensive, sanitized numbers from Yahoo quoteSummary
// payloads and resolves the Bursa sector used for model routing.
// ===========================================================================

import { toBursaCode, REIT_TICKERS } from "./bursa-ticker";
import type { Sector } from "./types";

/** Extract a defensible number from Yahoo's {raw,fmt} field or a bare number. */
export function extractRawNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return isFinite(val) ? val : 0;
  if (typeof val === "object") {
    const raw = (val as { raw?: unknown }).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
    const fmt = (val as { fmt?: unknown }).fmt;
    const parsed = typeof fmt === "string" ? parseFloat(fmt.replace(/[^\d.-]/g, "")) : NaN;
    return isFinite(parsed) ? parsed : 0;
  }
  const parsed = parseFloat(String(val));
  return isFinite(parsed) ? parsed : 0;
}

/**
 * Resolve the Bursa sector enum used for valuation routing.
 * Priority: REIT ticker/name match > raw Yahoo sector string.
 */
export function resolveSector(
  ticker: string,
  companyName: string = "",
  rawSector: string = "",
): Sector {
  const code = toBursaCode(ticker);
  const name = (companyName || "").toUpperCase();
  if (
    Object.values(REIT_TICKERS).includes(code) ||
    /(REIT|房地产投资信托|产托)/.test(name)
  ) {
    return "reit";
  }
  const s = (rawSector || "").toUpperCase();
  if (/(FINANCIAL|BANK|金融|银行)/.test(s)) return "bank";
  if (/(UTILIT|POWER|WATER|公用)/.test(s)) return "utilities";
  if (/(TECH|SEMICONDUCTOR|SOFTWARE|ELECTRONIC|科技)/.test(s)) return "tech";
  if (/(CONSUMER|FOOD|BEVERAGE|RETAIL|消费)/.test(s)) return "consumer";
  if (/(INDUSTRIAL|MANUFACTUR|ENERGY|OIL|GAS|工业)/.test(s)) return "industrial";
  return "general";
}

/** Extract a trailing DPS (RM) with yield-based fallback. */
export function extractDividendPerShare(
  quoteSummary: any,
  currentPrice: number,
): number {
  const sd = quoteSummary?.summaryDetail || {};
  const dk = quoteSummary?.defaultKeyStatistics || {};
  const dps =
    extractRawNumber(sd.trailingAnnualDividendRate) ||
    extractRawNumber(sd.dividendRate) ||
    extractRawNumber(dk.dividendRate);
  if (dps > 0) return dps;
  const yieldVal = extractRawNumber(sd.dividendYield);
  if (yieldVal > 0 && currentPrice > 0) return Number((currentPrice * yieldVal).toFixed(4));
  return 0;
}

/** Extract cash / debt / net-debt from quoteSummary financials + quarterly balance sheet. */
export function extractBalanceSheet(quoteSummary: any): {
  totalCash: number;
  totalDebt: number;
  netDebt: number;
} {
  const fd = quoteSummary?.financialData || {};
  const bs =
    quoteSummary?.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] || {};
  const totalCash =
    extractRawNumber(fd.totalCash) ||
    extractRawNumber(bs.cash) ||
    extractRawNumber(bs.cashAndCashEquivalents);
  const totalDebt = extractRawNumber(fd.totalDebt) || extractRawNumber(bs.totalDebt);
  const netDebt = totalDebt - totalCash;
  return { totalCash, totalDebt, netDebt };
}
