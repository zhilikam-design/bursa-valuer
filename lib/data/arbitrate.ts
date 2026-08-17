// Cross-source arbitration helpers. Pure functions, no I/O.

export type Agreement = "agree" | "mixed" | "single" | "none";

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Relative spread between the min and max values (0 when all equal). */
export function relSpread(values: number[]): number {
  if (values.length < 2) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  if (mid === 0) return 0;
  return (max - min) / Math.abs(mid);
}

/** Pick the median of the available finite readings, or null. */
export function pickMedian(
  values: (number | null | undefined)[],
): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && isFinite(v),
  );
  if (nums.length === 0) return null;
  return median(nums);
}

/**
 * Classify how well the sources agree.
 * "none"   — no readings at all
 * "single" — only one source contributed
 * "agree"  — multiple sources within `relTol` (default 30%)
 * "mixed"  — multiple sources disagree beyond `relTol`
 */
export function agreementOf(
  values: (number | null | undefined)[],
  relTol = 0.3,
): Agreement {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && isFinite(v),
  );
  if (nums.length === 0) return "none";
  if (nums.length === 1) return "single";
  return relSpread(nums) <= relTol ? "agree" : "mixed";
}
