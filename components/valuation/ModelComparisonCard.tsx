"use client";

import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/i18n";
import { formatMoney, formatPercentPts } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/valuation/types";

interface ModelComparisonCardProps {
  modelLabel: string;
  modelFull: string;
  recommended: boolean;
  active: boolean;
  applicable?: boolean;
  fairValue: number;
  upsidePct: number;
  marginOfSafetyPct: number;
  verdict: Verdict;
  onSelect: () => void;
}

export function ModelComparisonCard({
  modelLabel,
  modelFull,
  recommended,
  active,
  applicable = true,
  fairValue,
  upsidePct,
  marginOfSafetyPct,
  verdict,
  onSelect,
}: ModelComparisonCardProps) {
  const { t } = useLang();
  const verdictVariant: "buy" | "sell" | "hold" =
    verdict === "buy" ? "buy" : verdict === "sell" ? "sell" : "hold";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={cn(
        "w-full cursor-pointer rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-foreground/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{modelLabel}</div>
          <div className="text-xs text-muted-foreground">{modelFull}</div>
        </div>
        {recommended && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {t("model.recommended")}
          </Badge>
        )}
      </div>

      <div className="mt-3 text-xl font-bold tabular-nums">
        {applicable ? formatMoney(fairValue) : "N/A"}
      </div>

      {applicable ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">{t("result.upside")}</div>
            <div
              className={cn(
                "font-semibold tabular-nums",
                upsidePct >= 0 ? "text-up" : "text-down",
              )}
            >
              {formatPercentPts(upsidePct, 1, true)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("result.margin")}</div>
            <div className="font-semibold tabular-nums">
              {formatPercentPts(marginOfSafetyPct, 1)}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">
          {t("pe.notApplicable")}
        </div>
      )}

      <div className="mt-3">
        {applicable ? (
          <Badge variant={verdictVariant}>{t(`verdict.${verdict}`)}</Badge>
        ) : (
          <Badge variant="outline">N/A</Badge>
        )}
      </div>
    </div>
  );
}
