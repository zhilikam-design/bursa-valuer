import type { Sector } from "@/lib/valuation/types";

// Shared data types (client-safe). Actual fetching lives in ./yahoo.ts (server-only).
export interface YahooQuote {
  ticker: string;
  code: string;
  name: string;
  nameZh: string;
  price: number;
  currency: string;
  previousClose: number;
  changePct: number; // percent points, e.g. 1.25 = +1.25%
  marketCap: number; // RM
  eps: number | null; // RM (null = unknown; negative = loss-making)
  pe: number | null; // null when EPS <= 0 or unknown
  dividendYieldPct: number; // percent points, e.g. 5.9 = 5.9%
}

export interface StockData {
  ticker: string;
  code: string;
  quote: YahooQuote;
  seed: StockSeed | null;
  source: "yahoo" | "seed";
}

export interface StockSeed {
  code: string;
  ticker: string;
  name: string;
  nameZh: string;
  sector: Sector;
  price: number; // RM
  eps: number; // trailing EPS, RM
  dps: number; // trailing DPS, RM
  fcf: number; // trailing FCF, RM millions
  shares: number; // shares outstanding, millions
  netDebt: number; // RM millions (debt - cash)
  pe: number;
  dividendYieldPct: number; // percent points
}

/**
 * Offline demo defaults for well-known Bursa Malaysia counters.
 * These are approximate placeholder figures used only when the live
 * Yahoo Finance fetch is unavailable, so the valuation UI still works.
 */
export const SEED_STOCKS: StockSeed[] = [
  {
    code: "1155",
    ticker: "1155.KL",
    name: "Malayan Banking",
    nameZh: "马来亚银行 (Maybank)",
    sector: "bank",
    price: 10.1,
    eps: 0.75,
    dps: 0.6,
    fcf: 6200,
    shares: 12090,
    netDebt: 18000,
    pe: 13.5,
    dividendYieldPct: 5.9,
  },
  {
    code: "1295",
    ticker: "1295.KL",
    name: "Public Bank",
    nameZh: "大众银行",
    sector: "bank",
    price: 4.45,
    eps: 0.34,
    dps: 0.19,
    fcf: 4800,
    shares: 19410,
    netDebt: 12000,
    pe: 13.1,
    dividendYieldPct: 4.3,
  },
  {
    code: "1023",
    ticker: "1023.KL",
    name: "CIMB Group",
    nameZh: "联昌国际",
    sector: "bank",
    price: 8.2,
    eps: 0.68,
    dps: 0.42,
    fcf: 5200,
    shares: 10600,
    netDebt: 15000,
    pe: 12.1,
    dividendYieldPct: 5.1,
  },
  {
    code: "0166",
    ticker: "0166.KL",
    name: "Inari Amertron",
    nameZh: "益纳利美昌",
    sector: "tech",
    price: 3.05,
    eps: 0.12,
    dps: 0.08,
    fcf: 350,
    shares: 3750,
    netDebt: -800,
    pe: 25.4,
    dividendYieldPct: 2.6,
  },
  {
    code: "4707",
    ticker: "4707.KL",
    name: "Nestlé Malaysia",
    nameZh: "雀巢马来西亚",
    sector: "consumer",
    price: 96.0,
    eps: 2.9,
    dps: 2.8,
    fcf: 900,
    shares: 234.5,
    netDebt: 1600,
    pe: 33.1,
    dividendYieldPct: 2.9,
  },
  {
    code: "5347",
    ticker: "5347.KL",
    name: "Tenaga Nasional",
    nameZh: "国家能源",
    sector: "industrial",
    price: 14.2,
    eps: 0.62,
    dps: 0.46,
    fcf: 7200,
    shares: 5770,
    netDebt: 46000,
    pe: 22.9,
    dividendYieldPct: 3.2,
  },
  {
    code: "7113",
    ticker: "7113.KL",
    name: "Top Glove",
    nameZh: "顶级手套",
    sector: "industrial",
    price: 1.05,
    eps: 0.03,
    dps: 0.02,
    fcf: 210,
    shares: 8000,
    netDebt: -900,
    pe: 35.0,
    dividendYieldPct: 1.9,
  },
];

export const SEED_MAP: Record<string, StockSeed> = Object.fromEntries(
  SEED_STOCKS.map((s) => [s.code, s]),
);
