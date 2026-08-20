import { getStockData } from "../lib/data/yahoo";
import { calculateStockValuation } from "../lib/valuation-engine";

async function verify() {
  console.log("🔍 Running automated valuation sanity checks...");

  const testCases = [
    { code: "1155.KL", name: "Maybank", expectedMethod: "DDM", minVal: 8.0, maxVal: 15.0 },
    { code: "5176.KL", name: "Sunway REIT", expectedMethod: "DDM", minVal: 1.0, maxVal: 2.5 },
    { code: "0275.KL", name: "Oppstar", expectedMethod: "DCF", minVal: 0.2, maxVal: 1.5 },
  ] as const;

  for (const tc of testCases) {
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

    console.log(
      `- [${tc.name} (${tc.code})]: Method=${val.method}, FairValue=RM ${val.intrinsicValue.toFixed(2)}, Price=RM${val.currentPrice.toFixed(2)}`,
    );

    if (val.method !== tc.expectedMethod) {
      throw new Error(
        `❌ Model mismatch for ${tc.name}: expected ${tc.expectedMethod}, got ${val.method}`,
      );
    }
    if (
      val.intrinsicValue === 0 ||
      val.intrinsicValue < tc.minVal ||
      val.intrinsicValue > tc.maxVal
    ) {
      throw new Error(
        `❌ Distorted valuation for ${tc.name}: RM${val.intrinsicValue.toFixed(2)} outside expected range [${tc.minVal},${tc.maxVal}]`,
      );
    }
  }

  console.log("\n✅ All automated valuation checks PASSED!");
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
