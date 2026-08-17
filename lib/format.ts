// Formatting helpers. All rates are stored as decimals (0.038 => 3.80%).

export function formatMoney(value: number, decimals = 2): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toLocaleString("en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}RM ${fixed}`;
}

export function formatCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}RM ${(abs / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${sign}RM ${(abs / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `${sign}RM ${(abs / 1e3).toFixed(1)}k`;
  return `${sign}RM ${abs.toFixed(2)}`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// decimal -> "3.80%"
export function formatPercent(decimal: number, decimals = 2, signed = false): string {
  const pct = decimal * 100;
  const sign = signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

// whole number percent (8.0 -> "8.00%"), used by sliders that work in percentage points
export function formatPercentPts(pts: number, decimals = 2, signed = false): string {
  const sign = signed && pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(decimals)}%`;
}
