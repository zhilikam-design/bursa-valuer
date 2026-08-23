// scripts/test-valuation.ts
//
// 马股估值系统自动化测试套件，覆盖本次重构的全部能力：
//   1. 核心模型路由 + 公允价值区间（与 verify-valuation 对齐）
//   2. REIT 股息修复（非种子产托能解析出 dps + reit 板块）
//   3. Beta 走 ^KLSE 月线回归（betaAudit + 回归散点序列）
//   4. 动态增长率推导（ROE × 留存率）
//
// 运行：npx tsx scripts/test-valuation.ts

import { getStockData } from "../lib/data/yahoo";
import { calculateStockValuation } from "../lib/valuation-engine";
import { deriveSustainableGrowth } from "../lib/valuation";
import { normalizeSector } from "../lib/bursa";

let failures = 0;
let checks = 0;

function check(cond: boolean, msg: string) {
  checks++;
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  // --- 1. 核心模型路由 + 公允价值区间 ---
  section("1) Core valuation sanity (method routing + fair-value ranges)");
  const coreCases = [
    { code: "1155.KL", name: "Maybank", method: "DDM", min: 8.0, max: 15.0 },
    { code: "5176.KL", name: "Sunway REIT", method: "DDM", min: 1.0, max: 2.5 },
    { code: "0275.KL", name: "Oppstar", method: "DCF", min: 0.2, max: 1.5 },
  ] as const;

  for (const tc of coreCases) {
    const data = await getStockData(tc.code);
    const val = calculateStockValuation({
      sector: data.seed?.sector ?? data.quote.sector ?? "General",
      currentPrice: data.quote.price,
      dividendRate: data.quote.dps,
      freeCashflow: data.quote.fcf,
      sharesOutstanding: data.quote.shares,
      beta: data.quote.beta,
      eps: data.quote.eps,
    });
    const fv = val.intrinsicValue.toFixed(2);
    check(
      val.method === tc.method,
      `${tc.name}: method=${val.method} (expect ${tc.method})`,
    );
    check(
      val.intrinsicValue >= tc.min && val.intrinsicValue <= tc.max,
      `${tc.name}: fair value RM${fv} within [${tc.min}, ${tc.max}]`,
    );
  }

  // --- 2. REIT 股息修复 ---
  section("2) REIT dividend fix (non-seed REITs resolve dps + reit sector)");
  const reits = [
    { code: "5227", name: "IGB REIT" },
    { code: "5106", name: "Axis REIT" },
    { code: "5109", name: "YTL Hospitality REIT" },
  ];
  for (const r of reits) {
    const d = await getStockData(r.code);
    const sector = d.seed?.sector ?? normalizeSector(d.quote.sector);
    check(sector === "reit", `${r.name}: sector resolved to reit`);
    check((d.quote.dps ?? 0) > 0, `${r.name}: dps=${d.quote.dps?.toFixed(3) ?? "0"} > 0`);
    console.log(
      `      (${r.name}: dps=${d.quote.dps?.toFixed(3) ?? "n/a"}, ` +
        `roe=${d.financials.roe?.toFixed(4) ?? "n/a"}, ` +
        `beta=${d.quote.beta.toFixed(2)})`,
    );
  }

  // --- 3. K 线 beta 回归 ---
  section("3) K-line beta regression (^KLSE)");
  const maybank = await getStockData("1155.KL");
  const ba = maybank.betaAudit;
  check(!!ba, "betaAudit attached to StockData");
  if (ba) {
    check(
      ba.beta >= 0.2 && ba.beta <= 2.5,
      `beta=${ba.beta.toFixed(2)} within [0.2, 2.5]`,
    );
    check(
      ba.source === "quant_regression" || ba.source === "sector_fallback",
      `source=${ba.source}`,
    );
    if (ba.source === "quant_regression") {
      check(
        ba.regression.length >= 12,
        `regression sample=${ba.regression.length} (>= 12)`,
      );
      check(ba.rawBeta != null, `rawBeta=${ba.rawBeta?.toFixed(2)}`);
    }
    console.log(
      `      (beta=${ba.beta.toFixed(2)}, raw=${ba.rawBeta?.toFixed(2) ?? "n/a"}, ` +
        `source=${ba.source}, points=${ba.regression.length})`,
    );
  }

  // --- 4. 动态增长率推导 ---
  section("4) Dynamic growth (ROE × retention)");
  const roe = maybank.financials.roe;
  const payout = maybank.financials.payoutRatio;
  check(
    roe != null && roe > 0,
    `Maybank ROE extracted (${roe?.toFixed(4) ?? "null"})`,
  );
  const g = deriveSustainableGrowth("bank", roe, payout);
  check(g.source === "sustainable_roe", `growth source=${g.source}`);
  check(
    g.growthRate >= 0.01 && g.growthRate <= 0.15,
    `derived g=${(g.growthRate * 100).toFixed(2)}% within [1%, 15%]`,
  );
  console.log(
    `      (ROE=${roe?.toFixed(4) ?? "n/a"}, payout=${payout?.toFixed(4) ?? "n/a"}, ` +
      `g=${(g.growthRate * 100).toFixed(2)}%, source=${g.source})`,
  );

  // --- 汇总 ---
  console.log(`\n${"─".repeat(52)}`);
  if (failures === 0) {
    console.log(`✅ All ${checks} checks PASSED!`);
  } else {
    console.error(`❌ ${failures}/${checks} checks FAILED.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
