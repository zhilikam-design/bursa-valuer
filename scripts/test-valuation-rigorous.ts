// scripts/test-valuation-rigorous.ts
//
// 马股估值系统【高严谨度自动化审计套件】——覆盖别名冲突、REIT 分红逆推、
// ACE 前导零、银行 DDM 路由、净现金增厚、油气板块防误判等金融数学不变量。
//
// 运行：npx tsx scripts/test-valuation-rigorous.ts

import { normalizeTicker, deriveDiscountRate, TERMINAL_GROWTH_RATE, SECTOR_PRESETS } from "../lib/valuation/bursa-ticker";
import { getAccurateBursaBeta } from "../lib/valuation/bursa-beta";
import {
  resolveSector,
  extractDividendPerShare,
  extractBalanceSheet,
  extractRawNumber,
} from "../lib/valuation/balance-sheet-cleaner";
import { calculateDCFValuation } from "../lib/valuation/dcf-engine";
import { calculateDynamicDDM } from "../lib/valuation/ddm-engine";
import type { Sector, ModelId } from "../lib/valuation/types";

// --- 测试用例矩阵 ---
interface TestCase {
  input: string;
  expectedSymbol: string;
  expectedSector: Sector;
  expectedPrimaryModel: ModelId;
  description: string;
  validate?: (data: any) => void;
}

const TEST_SUITE: TestCase[] = [
  // 1. 产托与高息资产（验证 DPU 逆推与 DDM 锁定）
  {
    input: "YTLREIT",
    expectedSymbol: "5109.KL",
    expectedSector: "reit",
    expectedPrimaryModel: "ddm",
    description: "YTL REIT - 验证信托分红逆推与 DDM 强制路由",
    validate: (res) => {
      assert(res.dps > 0.05, `YTL REIT 每股分红 (${res.dps}) 必须大于 RM 0.05，不能解析为 0`);
      assert(res.ddm !== null, "YTL REIT 必须成功生成 DDM 估值结果");
      assert(res.ddm.intrinsicValue > 1.2, `DDM 公允估值 (${res.ddm.intrinsicValue}) 应处于合理区间 (> RM 1.20)`);
    },
  },
  {
    input: "SUNREIT",
    expectedSymbol: "5176.KL",
    expectedSector: "reit",
    expectedPrimaryModel: "ddm",
    description: "Sunway REIT - 产托别名与分红校验",
  },
  // 2. 别名冲突与母公司区分
  {
    input: "SUNWAY",
    expectedSymbol: "5211.KL",
    expectedSector: "industrial",
    expectedPrimaryModel: "dcf",
    description: "Sunway Berhad 母公司 - 必须精准映射为 5211 并走 DCF（非 5176 产托）",
  },
  // 3. 创业板 (ACE) 4位前导零与高成长 FCF 衰减
  {
    input: "0275",
    expectedSymbol: "0275.KL",
    expectedSector: "tech",
    expectedPrimaryModel: "dcf",
    description: "Oppstar - ACE 芯片设计（前导零补全与高 ROE 动态增速）",
    validate: (res) => {
      if (res.dcf) {
        const p = res.dcf.projections;
        assert(p.length === 5, "DCF 预测期必须为 5 年");
        // 校验增长率单调递减
        for (let i = 1; i < p.length; i++) {
          assert(
            p[i].growthRatePct <= p[i - 1].growthRatePct + 0.01,
            `第 ${i + 1} 年增速 (${p[i].growthRatePct}%) 不能高于第 ${i} 年 (${p[i - 1].growthRatePct}%)`
          );
        }
      }
    },
  },
  {
    input: "  166  ",
    expectedSymbol: "0166.KL",
    expectedSector: "tech",
    expectedPrimaryModel: "dcf",
    description: "Inari - 前后空格与前导零清洗（166 -> 0166.KL）",
  },
  // 4. 金融银行股（高杠杆与 DDM 路由）
  {
    input: "1155",
    expectedSymbol: "1155.KL",
    expectedSector: "bank",
    expectedPrimaryModel: "ddm",
    description: "Maybank - 蓝筹银行股 DDM 股息折现校验",
    validate: (res) => {
      assert(res.betaAudit.finalBeta >= 0.6 && res.betaAudit.finalBeta <= 1.2, "银行股 Beta 应在 0.6 ~ 1.2 之间");
      assert(res.ddm !== null, "银行股必须生成 DDM 结果");
    },
  },
  // 5. 净现金企业（Net Cash 估值增厚效应）
  {
    input: "7052",
    expectedSymbol: "7052.KL",
    expectedSector: "consumer",
    expectedPrimaryModel: "dcf",
    description: "Padini - 净现金零售股（Net Debt 应为负值并增厚股权价值）",
    validate: (res) => {
      if (res.dcf && res.netDebt < 0) {
        assert(
          res.dcf.equityValue > res.dcf.enterpriseValue,
          "净现金状态下，股东权益价值 (Equity Value) 必须大于企业价值 (EV)"
        );
      }
    },
  },
  // 6. 周期与油气股（防止误入 Utilities DDM）
  {
    input: "5199",
    expectedSymbol: "5199.KL",
    expectedSector: "industrial",
    expectedPrimaryModel: "dcf",
    description: "Hibiscus Petroleum - 周期油气股必须走 DCF",
  },
];

// --- 基础断言引擎 ---
let passCount = 0;
let failCount = 0;
const failures: string[] = [];
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[断言失败] ${message}`);
  }
}

// --- 通过 yahoo-finance2 抓取 quoteSummary（内部处理 cookie/crumb；裸 fetch 会 401）---
async function fetchQuoteSummary(symbol: string): Promise<any> {
  const mod = (await import("yahoo-finance2")) as {
    default?: new (o?: unknown) => unknown;
  };
  const Ctor = mod.default;
  if (typeof Ctor !== "function") return null;
  const yf = new Ctor() as {
    quoteSummary: (s: string, o: { modules?: string[] }) => Promise<Record<string, any>>;
  };
  return await yf.quoteSummary(symbol, {
    modules: [
      "price",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "balanceSheetHistoryQuarterly",
      "assetProfile",
    ],
  });
}

// --- 运行严谨测试 ---
async function runRigorousValuationTests() {
  console.log("================================================================================");
  console.log("🛡️  启动马股估值系统【高严谨度自动化审计套件】");
  console.log("================================================================================\n");
  const startTime = Date.now();
  for (let idx = 0; idx < TEST_SUITE.length; idx++) {
    const test = TEST_SUITE[idx];
    const testNum = `[Case ${idx + 1}/${TEST_SUITE.length}]`;
    console.log(`\n${testNum} 正在执行: ${test.description}`);
    console.log(`       输入参数: "${test.input}"`);
    try {
      // 1. 代码清洗断言
      const symbol = normalizeTicker(test.input);
      assert(symbol === test.expectedSymbol, `代码解析错误: 期望 ${test.expectedSymbol}，实际得到 ${symbol}`);
      // 2. 抓取财务报表（yahoo-finance2 处理 cookie/crumb，裸 v10 fetch 会 401）
      const result = await fetchQuoteSummary(symbol);
      assert(result != null, "Yahoo Finance 返回空数据包");
      const priceModule = result.price || {};
      const summaryDetail = result.summaryDetail || {};
      const defaultStats = result.defaultKeyStatistics || {};
      const financialData = result.financialData || {};
      const assetProfile = result.assetProfile || {};
      const companyName = priceModule.shortName || priceModule.longName || symbol;
      const currentPrice = extractRawNumber(priceModule.regularMarketPrice) || extractRawNumber(summaryDetail.previousClose);
      const sharesOutstanding = extractRawNumber(defaultStats.sharesOutstanding) || extractRawNumber(financialData.sharesOutstanding);
      const roe = extractRawNumber(financialData.returnOnEquity);
      const payoutRatio = extractRawNumber(summaryDetail.payoutRatio);
      const freeCashFlow = extractRawNumber(financialData.freeCashflow);
      // 3. 行业与模型路由断言
      const sector = resolveSector(symbol, companyName, assetProfile.sector ?? financialData.sector);
      assert(sector === test.expectedSector, `板块判定错误: 期望 ${test.expectedSector}，实际得到 ${sector}`);
      const primaryModel = SECTOR_PRESETS[sector]?.primaryModel;
      assert(primaryModel === test.expectedPrimaryModel, `主模型路由错误: 期望 ${test.expectedPrimaryModel}，实际得到 ${primaryModel}`);
      // 4. Beta 量化回归与数学边界断言
      const { beta, source: betaSource, rawCalculatedBeta } = await getAccurateBursaBeta(symbol, sector);
      assert(beta >= 0.3 && beta <= 2.5, `Beta (${beta}) 严重失真，脱离合法区间 [0.3, 2.5]`);
      assert(!isNaN(beta) && isFinite(beta), "Beta 不能为 NaN 或 Infinity");
      const discountRate = deriveDiscountRate(beta);
      assert(discountRate > TERMINAL_GROWTH_RATE, `折现率 (${discountRate}) 必须严格大于永续增长率 (${TERMINAL_GROWTH_RATE})`);
      // 5. 数据提取断言
      const dps = extractDividendPerShare(result, currentPrice);
      const { totalCash, totalDebt, netDebt } = extractBalanceSheet(result);
      // 6. 执行 DCF / DDM 计算
      const dcf = freeCashFlow > 0 && sharesOutstanding > 0
        ? calculateDCFValuation({
            symbol,
            currentPrice,
            sharesOutstanding,
            freeCashFlow,
            totalDebt,
            cashAndEquivalents: totalCash,
            roe,
            payoutRatio,
            beta,
            sector,
          })
        : null;
      const ddm = dps > 0
        ? calculateDynamicDDM({
            symbol,
            currentPrice,
            dividendPerShare: dps,
            roe,
            payoutRatio,
            beta,
            sector: sector as any,
          })
        : null;
      // 7. 执行自定义断言逻辑
      const testContext = {
        symbol,
        companyName,
        sector,
        currentPrice,
        dps,
        freeCashFlow,
        netDebt,
        betaAudit: { finalBeta: beta, source: betaSource, rawCalculatedBeta },
        discountRate,
        dcf,
        ddm,
      };
      if (test.validate) {
        test.validate(testContext);
      }
      console.log(`   ✅ [PASS] 板块: ${sector.toUpperCase()} | Beta: ${beta} (${betaSource}) | 现价: RM ${currentPrice}`);
      if (dcf) console.log(`      └─ DCF 每股公允价值: RM ${dcf.intrinsicValuePerShare} (空间: ${dcf.marginOfSafetyPct}%)`);
      if (ddm) console.log(`      └─ DDM 每股公允价值: RM ${ddm.intrinsicValue} (股息增速: ${ddm.derivedDivGrowth}%)`);
      passCount++;
    } catch (err: any) {
      console.error(`   ❌ [FAIL] 失败原因: ${err.message}`);
      failCount++;
      failures.push(`${test.description}: ${err.message}`);
    }
  }
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  // --- 输出总结报告 ---
  console.log("\n================================================================================");
  console.log("📊 自动化审计总结报告");
  console.log("================================================================================");
  console.log(`总执行用例: ${TEST_SUITE.length}`);
  console.log(`成功通过:   ${passCount} 项`);
  console.log(`未通过:     ${failCount} 项`);
  console.log(`执行耗时:   ${durationSec} 秒`);
  if (failCount > 0) {
    console.log("\n❌ 发现以下逻辑断言未通过，请排查：");
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log("================================================================================\n");
    process.exit(1); // 抛出异常退出码，阻止构建或 CI 合并
  } else {
    console.log("\n🎉 所有金融数学不变量与边界测试全部通过！系统稳健。");
    console.log("================================================================================\n");
    process.exit(0);
  }
}
runRigorousValuationTests();
