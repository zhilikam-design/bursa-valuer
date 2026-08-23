import type { Sector } from "./types";
import { normalizeTicker } from "./bursa-ticker";

// --- Damodaran 新兴市场行业 Beta 基准字典 (行业托底) ---
export const SECTOR_DEFAULT_BETA: Record<Sector, number> = {
  bank: 0.85, // 金融/银行
  reit: 0.6, // 产托（防御型、低波动）
  utilities: 0.65, // 公用事业
  tech: 1.15, // 科技半导体（高波动）
  consumer: 0.75, // 消费品与零售
  industrial: 0.9, // 工业制造与能源油气
  general: 0.85, // 综合大盘基准
};

export interface PricePoint {
  timestamp: number;
  close: number;
}

/** 配对的月收益率，用于回归散点图（横轴 ^KLSE，纵轴个股）。 */
export interface BetaRegressionPoint {
  marketReturn: number; // ^KLSE 月收益率 (小数)
  stockReturn: number; // 个股月收益率 (小数)
}

/**
 * 从 Yahoo Finance Chart API 获取历史月收盘价（复权价优先）
 */
export async function fetchMonthlyPrices(symbol: string): Promise<PricePoint[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=1mo&range=3y`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      next: { revalidate: 86400 }, // 历史月线数据缓存 24 小时
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp || [];
    // 优先使用复权收盘价 adjclose，缺失时退化到普通 close
    const adjCloses: (number | null)[] =
      result.indicators?.adjclose?.[0]?.adjclose ||
      result.indicators?.quote?.[0]?.close ||
      [];
    const points: PricePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const price = adjCloses[i];
      if (price != null && isFinite(price) && price > 0) {
        points.push({
          timestamp: timestamps[i],
          close: price,
        });
      }
    }
    return points;
  } catch (error) {
    console.warn(`[Beta Fetcher] Failed to fetch prices for ${symbol}:`, error);
    return [];
  }
}

/**
 * 量化回归算法：严格按月对齐收益率计算对标 ^KLSE 的 Beta，
 * 并返回配对的月收益率序列（用于回归散点图）。
 */
export function computeRegressionBeta(
  stockPoints: PricePoint[],
  marketPoints: PricePoint[],
): { beta: number; regression: BetaRegressionPoint[] } | null {
  if (stockPoints.length < 12 || marketPoints.length < 12) {
    return null; // 样本量小于 1 年（12个月）时返回 null，走行业兜底
  }
  // 1. 将大盘数据映射为 Map 以便按时间戳严格对齐
  const marketMap = new Map<number, number>();
  marketPoints.forEach((p) => marketMap.set(p.timestamp, p.close));
  // 2. 筛选共有月份并按时间升序排列
  const paired: { stock: number; market: number }[] = [];
  for (const sp of stockPoints) {
    // 允许 7 天内的时间戳微小误差匹配（防止不同标的结算日期偏差）
    const matchedTime = Array.from(marketMap.keys()).find(
      (mt) => Math.abs(mt - sp.timestamp) <= 7 * 86400,
    );
    if (matchedTime) {
      paired.push({
        stock: sp.close,
        market: marketMap.get(matchedTime)!,
      });
    }
  }
  if (paired.length < 12) return null;
  // 3. 计算月度收益率 (Monthly Returns)
  const regression: BetaRegressionPoint[] = [];
  const stockReturns: number[] = [];
  const marketReturns: number[] = [];
  for (let i = 1; i < paired.length; i++) {
    const rStock =
      (paired[i].stock - paired[i - 1].stock) / paired[i - 1].stock;
    const rMarket =
      (paired[i].market - paired[i - 1].market) / paired[i - 1].market;
    stockReturns.push(rStock);
    marketReturns.push(rMarket);
    regression.push({
      marketReturn: Number(rMarket.toFixed(6)),
      stockReturn: Number(rStock.toFixed(6)),
    });
  }
  const n = stockReturns.length;
  const avgStock = stockReturns.reduce((a, b) => a + b, 0) / n;
  const avgMarket = marketReturns.reduce((a, b) => a + b, 0) / n;
  // 4. 计算协方差与方差
  let covariance = 0;
  let marketVariance = 0;
  for (let i = 0; i < n; i++) {
    const diffStock = stockReturns[i] - avgStock;
    const diffMarket = marketReturns[i] - avgMarket;
    covariance += diffStock * diffMarket;
    marketVariance += diffMarket * diffMarket;
  }
  if (marketVariance <= 0.000001) return null;
  return { beta: covariance / marketVariance, regression };
}

export interface BetaResult {
  beta: number;
  source: "quant_regression" | "sector_fallback";
  rawCalculatedBeta?: number;
  regression?: BetaRegressionPoint[]; // 仅当 source === "quant_regression"
}

/**
 * 核心对外接口：获取马股精准 Beta
 * 整合：Yahoo 历史月线 -> 本地对标 ^KLSE 回归 -> Blume 调整 -> 行业基准兜底与边界约束
 */
export async function getAccurateBursaBeta(
  tickerInput: string,
  sector: Sector = "general",
): Promise<BetaResult> {
  const fallbackBeta = SECTOR_DEFAULT_BETA[sector] ?? 0.85;
  const symbol = normalizeTicker(tickerInput);
  if (!symbol) {
    return { beta: fallbackBeta, source: "sector_fallback" };
  }
  // 并行拉取个股和富时大马综指 (^KLSE) 过去 3 年的月线
  const [stockPrices, klsePrices] = await Promise.all([
    fetchMonthlyPrices(symbol),
    fetchMonthlyPrices("^KLSE"),
  ]);
  const reg = computeRegressionBeta(stockPrices, klsePrices);
  // 异常值过滤：如果算不出来、或者小于 0.2、大于 2.5，则使用行业基准平滑兜底
  if (
    reg == null ||
    !isFinite(reg.beta) ||
    reg.beta <= 0.2 ||
    reg.beta > 2.5
  ) {
    return {
      beta: fallbackBeta,
      source: "sector_fallback",
      rawCalculatedBeta: reg ? Number(reg.beta.toFixed(2)) : undefined,
    };
  }
  // Blume 调整：0.67 * Raw + 0.33 * 1.0 (向均值收敛)
  const adjustedBeta = Number((0.67 * reg.beta + 0.33 * 1.0).toFixed(2));
  const finalBeta = Math.max(0.3, Math.min(adjustedBeta, 2.5));
  return {
    beta: finalBeta,
    source: "quant_regression",
    rawCalculatedBeta: Number(reg.beta.toFixed(2)),
    regression: reg.regression,
  };
}
