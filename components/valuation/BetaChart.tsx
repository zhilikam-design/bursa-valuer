"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLang } from "@/lib/i18n";
import { formatPercentPts } from "@/lib/format";

export interface BetaRegressionPoint {
  marketReturn: number; // ^KLSE monthly return (decimal)
  stockReturn: number; // stock monthly return (decimal)
}

interface BetaChartProps {
  regression: BetaRegressionPoint[];
  rawBeta: number | null; // regression slope (null → sector fallback, no line)
  source: "quant_regression" | "sector_fallback";
}

export function BetaChart({ regression, rawBeta, source }: BetaChartProps) {
  const { t } = useLang();

  if (
    source !== "quant_regression" ||
    regression.length < 2 ||
    rawBeta == null
  ) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground">
        {t("beta.noRegression")}
      </div>
    );
  }

  // Fit the regression line (slope = raw beta, intercept = least-squares mean).
  // Merge the fitted values into the same rows so Scatter + Line share one data
  // array (avoids per-child `data` overrides).
  const n = regression.length;
  const meanM = regression.reduce((a, p) => a + p.marketReturn, 0) / n;
  const meanS = regression.reduce((a, p) => a + p.stockReturn, 0) / n;
  const intercept = meanS - rawBeta * meanM;
  const data = regression.map((p) => ({
    marketReturn: p.marketReturn,
    stockReturn: p.stockReturn,
    fitted: intercept + rawBeta * p.marketReturn,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="marketReturn"
            type="number"
            domain={["dataMin", "dataMax"] as never}
            tickFormatter={(v: number) => formatPercentPts(v * 100, 0)}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="number"
            domain={["dataMin", "dataMax"] as never}
            tickFormatter={(v: number) => formatPercentPts(v * 100, 0)}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            formatter={((v: number) => [
              formatPercentPts(v * 100, 2),
              t("beta.chart.point"),
            ]) as never}
            labelFormatter={((l: number) =>
              `${t("beta.chart.x")}: ${formatPercentPts(l * 100, 2)}`) as never}
          />
          <ReferenceLine x={0} stroke="#888" strokeDasharray="4 4" />
          <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" />
          <Scatter
            dataKey="stockReturn"
            name={t("beta.chart.point")}
            fill="hsl(221 83% 43%)"
            fillOpacity={0.55}
          />
          <Line
            dataKey="fitted"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
