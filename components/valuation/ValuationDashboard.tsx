"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { LangProvider, useLang } from "@/lib/i18n";
import {
  MARKET_ASSUMPTIONS,
  SECTOR_ORDER,
  SECTOR_PRESETS,
} from "@/lib/bursa";
import { dcfSensitivity, runValuation } from "@/lib/valuation";
import type { ModelId, Sector } from "@/lib/valuation/types";
import type { StockData } from "@/lib/data/seed";
import {
  formatCompact,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPercentPts,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LangToggle } from "@/components/LangToggle";
import { AssumptionSlider } from "@/components/valuation/AssumptionSlider";
import { ModelComparisonCard } from "@/components/valuation/ModelComparisonCard";
import { ValuationCharts } from "@/components/valuation/ValuationCharts";

interface ValuationDashboardProps {
  ticker: string;
  data: StockData;
}

function MacroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DashboardInner({ data }: ValuationDashboardProps) {
  const { t, lang } = useLang();
  const quote = data.quote;
  const fin = data.financials;

  const initialSector: Sector = data.seed?.sector ?? "general";
  const preset = SECTOR_PRESETS[initialSector];
  const initialPrice =
    quote.price > 0 ? quote.price : data.seed?.price ?? 0;

  // --- editable assumptions (display units) ---
  const [sector, setSector] = useState<Sector>(initialSector);
  const [price, setPrice] = useState<number>(initialPrice);

  // DCF — initialized from resolved financials, never from hardcoded dummies
  const [fcf, setFcf] = useState<number>(fin.fcf ?? 0);
  const [growthPct, setGrowthPct] = useState<number>(preset.growthPct);
  const [terminalPct, setTerminalPct] = useState<number>(preset.terminalGrowthPct);
  const [discountPct, setDiscountPct] = useState<number>(preset.discountPct);
  const [shares, setShares] = useState<number>(fin.sharesOutstanding ?? 0);
  const [netDebt, setNetDebt] = useState<number>(fin.netDebt ?? 0);

  // DDM
  const [dps, setDps] = useState<number>(fin.dps ?? 0);
  const [divGrowthPct, setDivGrowthPct] = useState<number>(
    Math.min(Math.max(preset.divGrowthPct, 2), 4),
  );
  const [requiredReturnPct, setRequiredReturnPct] = useState<number>(
    preset.requiredReturnPct,
  );

  // PE
  const [eps, setEps] = useState<number>(fin.eps ?? 0);
  const [peLow, setPeLow] = useState<number>(preset.peLow);
  const [peBase, setPeBase] = useState<number>(preset.peBase);
  const [peHigh, setPeHigh] = useState<number>(preset.peHigh);
  const [peGrowthPct, setPeGrowthPct] = useState<number>(0);

  const [activeModel, setActiveModel] = useState<ModelId>(preset.primaryModel);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const dcfInputs = {
    freeCashFlow: fcf,
    growthRate: growthPct / 100,
    terminalGrowthRate: terminalPct / 100,
    discountRate: discountPct / 100,
    sharesOutstanding: shares,
    netDebt,
    projectionYears: MARKET_ASSUMPTIONS.projectionYears,
  };

  const result = useMemo(
    () =>
      runValuation({
        price,
        sector,
        dcf: dcfInputs,
        ddm: {
          dividendPerShare: dps,
          dividendGrowthRate: divGrowthPct / 100,
          requiredReturn: requiredReturnPct / 100,
        },
        pe: {
          normalizedEps: eps,
          peLow,
          peBase,
          peHigh,
          growthRate: peGrowthPct / 100,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      price,
      sector,
      fcf,
      growthPct,
      terminalPct,
      discountPct,
      shares,
      netDebt,
      dps,
      divGrowthPct,
      requiredReturnPct,
      eps,
      peLow,
      peBase,
      peHigh,
      peGrowthPct,
    ],
  );

  const sensitivity = useMemo(
    () =>
      dcfSensitivity(
        dcfInputs,
        [-3, -2, -1, 0, 1, 2, 3].map((d) => discountPct + d),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fcf, growthPct, terminalPct, discountPct, shares, netDebt],
  );

  const bandData = [
    { model: t("model.dcf"), fairValue: result.dcf?.fairValuePerShare ?? 0 },
    { model: t("model.ddm"), fairValue: result.ddm?.fairValuePerShare ?? 0 },
    ...(result.pe?.applicable
      ? [{ model: t("model.pe"), fairValue: result.pe.fairValueBase }]
      : []),
  ];

  function onSectorChange(s: Sector) {
    setSector(s);
    const p = SECTOR_PRESETS[s];
    setGrowthPct(p.growthPct);
    setTerminalPct(p.terminalGrowthPct);
    setDiscountPct(p.discountPct);
    setDivGrowthPct(p.divGrowthPct);
    setRequiredReturnPct(p.requiredReturnPct);
    setPeLow(p.peLow);
    setPeBase(p.peBase);
    setPeHigh(p.peHigh);
    setActiveModel(p.primaryModel);
  }

  async function refreshPrice() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(data.code)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      const freshPrice = json?.quote?.price;
      if (typeof freshPrice === "number" && freshPrice > 0) {
        setPrice(freshPrice);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore — keep current price on failure
    } finally {
      setRefreshing(false);
    }
  }

  const primaryResult =
    result.primary === "dcf"
      ? result.dcf
      : result.primary === "ddm"
        ? result.ddm
        : result.pe;

  const verdictVariant: "buy" | "sell" | "hold" =
    result.verdict === "buy" ? "buy" : result.verdict === "sell" ? "sell" : "hold";

  const changeColor = quote.changePct >= 0 ? "text-up" : "text-down";

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft className="h-4 w-4" />
            {t("app.name")}
          </a>
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Stock header */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                {lang === "zh" ? quote.nameZh : quote.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {quote.code} · {quote.ticker}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t("stock.dataSource")}:{" "}
                  {[
                    data.dataSources.yahoo ? t("stock.yahoo") : null,
                    data.dataSources.fmp ? t("stock.fmp") : null,
                    data.dataSources.seed ? t("stock.demo") : null,
                  ]
                    .filter(Boolean)
                    .join(" + ") || t("stock.unknown")}
                </span>
                {data.epsAgreement !== "none" && (
                  <Badge
                    variant={
                      data.epsAgreement === "agree"
                        ? "buy"
                        : data.epsAgreement === "mixed"
                          ? "hold"
                          : "secondary"
                    }
                  >
                    EPS: {t(`stock.${data.epsAgreement}`)}
                  </Badge>
                )}
                {fin.isFallback && (
                  <Badge variant="hold">{t("stock.estimatedBadge")}</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold tabular-nums">
                  {formatMoney(price)}
                </div>
                <button
                  onClick={refreshPrice}
                  disabled={refreshing}
                  aria-label="刷新价格 / Refresh price"
                  title="刷新价格 / Refresh price"
                  className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", refreshing && "animate-spin")}
                  />
                </button>
              </div>
              {quote.changePct !== 0 && (
                <span className={cn("text-sm font-medium", changeColor)}>
                  {formatPercentPts(quote.changePct, 2, true)}
                </span>
              )}
              {lastUpdated && (
                <span className="text-[11px] text-muted-foreground">
                  {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("stock.price")}
              </div>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t("stock.sector")}
              </div>
              <select
                value={sector}
                onChange={(e) => onSectorChange(e.target.value as Sector)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SECTOR_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(`sector.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">EPS</div>
              <div className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-sm font-mono tabular-nums">
                {quote.eps == null ? (
                  t("stock.na")
                ) : (
                  <span className={quote.eps < 0 ? "text-down" : undefined}>
                    {formatMoney(quote.eps, 2)}
                    {quote.eps < 0 ? ` ${t("stock.loss")}` : ""}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">P/E</div>
              <div className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-sm font-mono tabular-nums">
                {quote.eps != null && quote.eps > 0
                  ? (quote.pe ?? price / quote.eps).toFixed(1) + "×"
                  : t("stock.na")}
              </div>
            </div>
          </div>
        </div>

        {/* Macro strip */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("macro.title")}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MacroStat
              label={t("macro.rf")}
              value={formatPercent(MARKET_ASSUMPTIONS.riskFreeRate)}
            />
            <MacroStat
              label={t("macro.erp")}
              value={formatPercent(MARKET_ASSUMPTIONS.equityRiskPremium)}
            />
            <MacroStat
              label={t("macro.tax")}
              value={formatPercent(MARKET_ASSUMPTIONS.corporateTaxRate, 0)}
            />
            <MacroStat
              label={t("macro.baseline")}
              value={formatPercent(MARKET_ASSUMPTIONS.baselineDiscountRate)}
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("assumptions.title")}</CardTitle>
                <CardDescription>
                  {t("sector.hint")}: {t(`model.${result.primary}`)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeModel}
                  onValueChange={(v) => setActiveModel(v as ModelId)}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="dcf">{t("model.dcf")}</TabsTrigger>
                    <TabsTrigger value="ddm">{t("model.ddm")}</TabsTrigger>
                    <TabsTrigger value="pe">{t("model.pe")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="dcf" className="space-y-4 pt-4">
                    {!result.dcf?.applicable && (
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        {t("dcf.insufficient")}
                      </div>
                    )}
                    <AssumptionSlider
                      label={t("dcf.fcf")}
                      value={fcf}
                      min={0}
                      max={20000}
                      step={10}
                      onChange={setFcf}
                      format={formatCompact}
                    />
                    <AssumptionSlider
                      label={t("dcf.growth")}
                      value={growthPct}
                      min={-5}
                      max={30}
                      step={0.1}
                      onChange={setGrowthPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                    <AssumptionSlider
                      label={t("dcf.terminal")}
                      value={terminalPct}
                      min={0}
                      max={8}
                      step={0.1}
                      onChange={setTerminalPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                    <AssumptionSlider
                      label={t("dcf.discount")}
                      value={discountPct}
                      min={4}
                      max={20}
                      step={0.1}
                      onChange={setDiscountPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                    <AssumptionSlider
                      label={t("dcf.shares")}
                      value={shares}
                      min={0}
                      max={30000}
                      step={10}
                      onChange={setShares}
                      format={(v) => formatNumber(v, 0)}
                    />
                    <AssumptionSlider
                      label={t("dcf.netDebt")}
                      value={netDebt}
                      min={-20000}
                      max={100000}
                      step={100}
                      onChange={setNetDebt}
                      format={formatCompact}
                    />
                  </TabsContent>

                  <TabsContent value="ddm" className="space-y-4 pt-4">
                    {!result.ddm?.applicable && (
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        {t("ddm.insufficient")}
                      </div>
                    )}
                    {result.ddm?.warning && (
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        {t("ddm.warning")}
                      </div>
                    )}
                    <AssumptionSlider
                      label={t("ddm.dps")}
                      value={dps}
                      min={0}
                      max={10}
                      step={0.01}
                      disabled={!result.ddm?.applicable}
                      onChange={setDps}
                      format={(v) => formatMoney(v, 2)}
                    />
                    <AssumptionSlider
                      label={t("ddm.growth")}
                      value={divGrowthPct}
                      min={0}
                      max={6}
                      step={0.1}
                      disabled={!result.ddm?.applicable}
                      onChange={setDivGrowthPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                    <AssumptionSlider
                      label={t("ddm.required")}
                      value={requiredReturnPct}
                      min={4}
                      max={20}
                      step={0.1}
                      disabled={!result.ddm?.applicable}
                      onChange={setRequiredReturnPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                  </TabsContent>

                  <TabsContent value="pe" className="space-y-4 pt-4">
                    {eps <= 0 && (
                      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        {t("pe.notApplicable")}
                      </div>
                    )}
                    <AssumptionSlider
                      label={t("pe.eps")}
                      value={eps}
                      min={-5}
                      max={10}
                      step={0.01}
                      onChange={setEps}
                      format={(v) => formatMoney(v, 2)}
                    />
                    <AssumptionSlider
                      label={t("pe.growth")}
                      value={peGrowthPct}
                      min={0}
                      max={30}
                      step={0.1}
                      onChange={setPeGrowthPct}
                      format={(v) => formatPercentPts(v, 1)}
                    />
                    <AssumptionSlider
                      label={t("pe.low")}
                      value={peLow}
                      min={1}
                      max={60}
                      step={0.5}
                      onChange={setPeLow}
                      format={(v) => `${v.toFixed(1)}×`}
                    />
                    <AssumptionSlider
                      label={t("pe.base")}
                      value={peBase}
                      min={1}
                      max={60}
                      step={0.5}
                      onChange={setPeBase}
                      format={(v) => `${v.toFixed(1)}×`}
                    />
                    <AssumptionSlider
                      label={t("pe.high")}
                      value={peHigh}
                      min={1}
                      max={80}
                      step={0.5}
                      onChange={setPeHigh}
                      format={(v) => `${v.toFixed(1)}×`}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <ValuationCharts
                  bandData={bandData}
                  sensitivityData={sensitivity}
                  price={price}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("result.comparison")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ModelComparisonCard
                  modelLabel={t("model.dcf")}
                  modelFull={t("model.dcf.full")}
                  recommended={result.primary === "dcf"}
                  active={activeModel === "dcf"}
                  applicable={result.dcf?.applicable ?? false}
                  naReason={t("dcf.insufficient")}
                  fairValue={result.dcf?.fairValuePerShare ?? 0}
                  upsidePct={result.dcf?.upsidePct ?? 0}
                  marginOfSafetyPct={result.dcf?.marginOfSafetyPct ?? 0}
                  verdict={result.dcf?.verdict ?? "hold"}
                  onSelect={() => setActiveModel("dcf")}
                />
                <ModelComparisonCard
                  modelLabel={t("model.ddm")}
                  modelFull={t("model.ddm.full")}
                  recommended={result.primary === "ddm"}
                  active={activeModel === "ddm"}
                  applicable={result.ddm?.applicable ?? false}
                  naReason={t("ddm.insufficient")}
                  fairValue={result.ddm?.fairValuePerShare ?? 0}
                  upsidePct={result.ddm?.upsidePct ?? 0}
                  marginOfSafetyPct={result.ddm?.marginOfSafetyPct ?? 0}
                  verdict={result.ddm?.verdict ?? "hold"}
                  onSelect={() => setActiveModel("ddm")}
                />
                <ModelComparisonCard
                  modelLabel={t("model.pe")}
                  modelFull={t("model.pe.full")}
                  recommended={result.primary === "pe"}
                  active={activeModel === "pe"}
                  applicable={result.pe?.applicable ?? false}
                  naReason={t("pe.notApplicable")}
                  fairValue={result.pe?.fairValueBase ?? 0}
                  upsidePct={result.pe?.upsidePct ?? 0}
                  marginOfSafetyPct={result.pe?.marginOfSafetyPct ?? 0}
                  verdict={result.pe?.verdict ?? "hold"}
                  onSelect={() => setActiveModel("pe")}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("result.verdict")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t(`model.${result.primary}`)} ·{" "}
                    {t("model.recommended")}
                  </span>
                  <Badge variant={verdictVariant}>
                    {result.blendedFairValue > 0
                      ? t(`verdict.${result.verdict}`)
                      : t("stock.na")}
                  </Badge>
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {result.blendedFairValue > 0
                    ? formatMoney(result.primaryFairValue)
                    : t("stock.na")}
                </div>
                <div className="text-sm">
                  {t("result.upside")}:{" "}
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      result.primaryUpsidePct >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {formatPercentPts(result.primaryUpsidePct, 1, true)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("blended")}:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {formatMoney(result.blendedFairValue)}
                  </span>
                </div>

                {primaryResult && primaryResult.breakdown.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    {primaryResult.breakdown.map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {t(row.key)}
                        </span>
                        <span className="font-mono tabular-nums">
                          {row.kind === "percent"
                            ? formatPercent(row.value)
                            : formatMoney(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          {t("disclaimer")}
        </p>
      </main>
    </div>
  );
}

export default function ValuationDashboard(props: ValuationDashboardProps) {
  return (
    <LangProvider>
      <DashboardInner {...props} />
    </LangProvider>
  );
}
