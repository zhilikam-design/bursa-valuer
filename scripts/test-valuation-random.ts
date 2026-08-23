// scripts/test-valuation-random.ts
//
// 随机抽样估值审计（property-based）：每次从 Bursa 股票池随机抽 N 家公司，
// 走完整数据链路（TradingView 同步数据 + Yahoo 交叉补全股息/ROE/板块），
// 对每只股票跑「代码、Beta、增长率、DCF、DDM、PE」六项金融数学不变量。
//
// 用法：
//   npx tsx scripts/test-valuation-random.ts              # 随机 20 只（种子=当前时间）
//   npx tsx scripts/test-valuation-random.ts --count=50   # 随机 50 只
//   npx tsx scripts/test-valuation-random.ts --seed=42    # 固定种子（复现同一批）

import syncedJson from "../lib/data/bursa-stocks.json";
import { getStockData } from "../lib/data/yahoo";
import {
  normalizeTicker,
  deriveDiscountRate,
  TERMINAL_GROWTH_RATE,
  SECTOR_PRESETS,
  normalizeSector,
} from "../lib/valuation/bursa-ticker";
import { calculateDCFValuation } from "../lib/valuation/dcf-engine";
import { calculateDynamicDDM } from "../lib/valuation/ddm-engine";
import { computePeBand } from "../lib/valuation/pe-band";
import type { Sector } from "../lib/valuation/types";

interface PoolStock {
  ticker: string;
  name: string;
  price: number;
}

// Dedupe: the JSON keys each stock under both its ticker name and (when
// resolved) its numeric code, so Object.values() repeats records.
const POOL: PoolStock[] = (() => {
  const seen = new Set<string>();
  return Object.values(
    (syncedJson as { stocks?: Record<string, PoolStock> }).stocks ?? {},
  ).filter((s) => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return typeof s.price === "number" && s.price > 0;
  });
})();

// --- 命令行参数 ---
function parseArgs(argv: string[]) {
  let count = 20;
  let seed: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--count=")) {
      count = Math.max(1, parseInt(a.slice(8), 10) || 20);
    } else if (a.startsWith("--seed=")) {
      seed = parseInt(a.slice(7), 10) || 0;
    }
  }
  return { count, seed };
}

// --- 确定性 PRNG（mulberry32）---
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 断言引擎 ---
let failures = 0;
let checks = 0;
function check(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`      ✗ ${msg}`);
  }
}

async function main() {
  const { count, seed: seedArg } = parseArgs(process.argv.slice(2));
  const seed = seedArg ?? Math.floor(Math.random() * 2 ** 31);
  const rand = mulberry32(seed);

  console.log("=".repeat(72));
  console.log(
    `🎲 随机抽样估值审计 — 股票池 ${POOL.length} 只，本次抽 ${count} 只（代码/Beta/增长率/DCF/DDM/PE）`,
  );
  console.log(
    `   种子 seed=${seed}${seedArg == null ? "（随机）" : ""}  —  复现请加 --seed=${seed}`,
  );
  console.log("=".repeat(72));

  if (POOL.length === 0) {
    console.error("❌ 股票池为空（检查 lib/data/bursa-stocks.json）。");
    process.exit(1);
  }

  // Fisher–Yates 抽样
  const shuffled = POOL.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));

  let dcfRan = 0;
  let ddmRan = 0;
  let peRan = 0;
  let roeOk = 0;
  let regressionOk = 0;

  for (let idx = 0; idx < picked.length; idx++) {
    const s = picked[idx];
    // 完整链路：TradingView 同步 + Yahoo 交叉补全（股息/ROE/板块）
    const data = await getStockData(s.ticker);
    const q = data.quote;
    const fin = data.financials;
    const sector: Sector = data.seed?.sector ?? normalizeSector(q.sector);
    const preset = SECTOR_PRESETS[sector] ?? SECTOR_PRESETS.general;
    const symbol = q.ticker;

    console.log(
      `\n[${idx + 1}/${picked.length}] ${symbol} — ${q.name} [${sector}]`,
    );
    console.log(
      `   数据源: ${[
        data.dataSources.synced ? "TradingView" : null,
        data.dataSources.yahoo ? "Yahoo" : null,
        data.dataSources.seed ? "Seed" : null,
      ]
        .filter(Boolean)
        .join(" + ")} | EPS: ${data.epsAgreement}`,
    );

    // 1. 代码（ticker 归一化）
    check(symbol.endsWith(".KL"), `代码归一化: ${symbol}`);

    // 2. Beta（^KLSE 月线回归）
    const ba = data.betaAudit;
    const beta = ba?.beta ?? q.beta ?? 1;
    if (ba?.source === "quant_regression") regressionOk++;
    check(
      isFinite(beta) && beta >= 0.3 && beta <= 2.5,
      `Beta=${beta.toFixed(2)} (${ba?.source ?? "n/a"}) ∈ [0.3, 2.5]`,
    );
    const r = deriveDiscountRate(beta);
    check(
      r > TERMINAL_GROWTH_RATE,
      `折现率 ${(r * 100).toFixed(2)}% > 永续 ${(TERMINAL_GROWTH_RATE * 100).toFixed(0)}%`,
    );

    // 3. 增长率 + DCF
    if ((fin.fcf ?? 0) > 0 && (fin.sharesOutstanding ?? 0) > 0) {
      const dcf = calculateDCFValuation({
        symbol,
        currentPrice: q.price,
        sharesOutstanding: fin.sharesOutstanding!,
        freeCashFlow: fin.fcf!,
        totalDebt: fin.netDebt ?? 0,
        cashAndEquivalents: 0,
        roe: fin.roe,
        payoutRatio: fin.payoutRatio,
        beta,
        sector,
      });
      dcfRan++;
      check(dcf != null, "fcf/shares 齐全时 DCF 不应返回 null");
      if (dcf) {
        if (dcf.growthSource === "sustainable_roe") roeOk++;
        check(
          dcf.derivedGrowthRate >= 0.01 && dcf.derivedGrowthRate <= 0.15,
          `增长率=${(dcf.derivedGrowthRate * 100).toFixed(2)}% (${dcf.growthSource}) ∈ [1%, 15%]`,
        );
        check(
          isFinite(dcf.intrinsicValuePerShare) && dcf.intrinsicValuePerShare > 0,
          `DCF 每股公允 RM ${dcf.intrinsicValuePerShare.toFixed(2)} > 0`,
        );
        check(dcf.projections.length === 5, "DCF 预测期 = 5 年");
        for (let j = 1; j < dcf.projections.length; j++) {
          check(
            dcf.projections[j].growthRatePct <=
              dcf.projections[j - 1].growthRatePct + 1e-9,
            `增速递减 第${j + 1}年 ${dcf.projections[j].growthRatePct.toFixed(2)}% ≤ 第${j}年 ${dcf.projections[j - 1].growthRatePct.toFixed(2)}%`,
          );
        }
        check(
          Math.abs(dcf.enterpriseValue - dcf.netDebt - dcf.equityValue) < 1,
          "恒等式 EV − 净负债 = 股权价值",
        );
      }
    } else {
      console.log("   · DCF 跳过（fcf/shares 缺失）");
    }

    // 4. DDM
    if ((fin.dps ?? 0) > 0) {
      const ddm = calculateDynamicDDM({
        symbol,
        currentPrice: q.price,
        dividendPerShare: fin.dps!,
        roe: fin.roe,
        payoutRatio: fin.payoutRatio,
        beta,
        sector,
      });
      ddmRan++;
      check(
        ddm != null && isFinite(ddm.intrinsicValue) && ddm.intrinsicValue > 0,
        `DDM 每股公允 RM ${ddm?.intrinsicValue.toFixed(2) ?? "null"} > 0`,
      );
    } else {
      console.log("   · DDM 跳过（无股息）");
    }

    // 5. PE 区间
    if ((fin.eps ?? 0) > 0) {
      const pe = computePeBand(
        {
          normalizedEps: fin.eps!,
          peLow: preset.peLow,
          peBase: preset.peBase,
          peHigh: preset.peHigh,
          growthRate: 0,
        },
        q.price,
      );
      peRan++;
      check(
        pe.applicable && pe.fairValueBase >= 0,
        `PE 基准公允 RM ${pe.fairValueBase.toFixed(2)} ≥ 0`,
      );
      check(
        pe.fairValueLow <= pe.fairValueBase &&
          pe.fairValueBase <= pe.fairValueHigh,
        `PE 区间 low ${pe.fairValueLow.toFixed(2)} ≤ base ${pe.fairValueBase.toFixed(2)} ≤ high ${pe.fairValueHigh.toFixed(2)}`,
      );
    } else {
      console.log("   · PE 跳过（亏损/无 EPS）");
    }
  }

  // --- 汇总 ---
  const n = picked.length;
  console.log("\n" + "=".repeat(72));
  console.log("📊 随机抽样估值审计报告");
  console.log("=".repeat(72));
  console.log(`   抽查公司数:        ${n}`);
  console.log(`   断言总数:          ${checks}，失败: ${failures}`);
  console.log("   数据覆盖率（交叉验证后）:");
  console.log(`      Beta 回归命中:  ${regressionOk}/${n}`);
  console.log(`      DCF 运行:       ${dcfRan}/${n}`);
  console.log(`      DDM 运行(有股息): ${ddmRan}/${n}`);
  console.log(`      PE 运行(有盈利):  ${peRan}/${n}`);
  console.log(`      ROE 内生增速命中: ${roeOk}/${n}`);
  if (failures === 0) {
    console.log("\n🎉 所有金融数学不变量通过！");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} 项断言失败，请用 --seed=${seed} 复现排查。`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
