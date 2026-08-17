"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLang } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export interface BandPoint {
  model: string;
  fairValue: number;
}

export interface SensPoint {
  x: number;
  fairValue: number;
}

interface ValuationChartsProps {
  bandData: BandPoint[];
  sensitivityData: SensPoint[];
  price: number;
}

export function ValuationCharts({
  bandData,
  sensitivityData,
  price,
}: ValuationChartsProps) {
  const { t } = useLang();
  const moneyTick = (v: unknown) => formatMoney(Number(v), 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("chart.band")}</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bandData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="model" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={moneyTick}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                formatter={((v: number) => formatMoney(v, 2)) as never}
                cursor={{ fill: "rgba(0,0,0,0.05)" }}
              />
              <ReferenceLine
                y={price}
                stroke="#dc2626"
                strokeDasharray="4 4"
                label={{
                  value: t("chart.currentPrice"),
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "#dc2626",
                }}
              />
              <Bar
                dataKey="fairValue"
                name={t("chart.fairValue")}
                fill="hsl(221 83% 43%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("chart.sensitivity")}</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sensitivityData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"] as never}
                tickFormatter={(v: number) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={moneyTick}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                formatter={((v: number) => formatMoney(v, 2)) as never}
                labelFormatter={(l: number) => `${t("dcf.discount")}: ${l}%`}
              />
              <ReferenceLine
                y={price}
                stroke="#dc2626"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="fairValue"
                name={t("chart.fairValue")}
                stroke="hsl(221 83% 43%)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
