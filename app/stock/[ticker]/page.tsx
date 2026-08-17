import type { Metadata } from "next";
import { getStockData } from "@/lib/data/yahoo";
import { toBursaCode } from "@/lib/bursa";
import ValuationDashboard from "@/components/valuation/ValuationDashboard";

interface StockPageProps {
  params: { ticker: string };
}

export async function generateMetadata({
  params,
}: StockPageProps): Promise<Metadata> {
  const code = toBursaCode(params.ticker);
  return {
    title: `${code} · BursaValuer`,
  };
}

export default async function StockPage({ params }: StockPageProps) {
  const data = await getStockData(params.ticker);
  return <ValuationDashboard ticker={data.ticker} data={data} />;
}
