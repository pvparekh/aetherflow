export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Population standard deviation (all items are the full set, not a sample)
export function populationStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export interface CategoryAggregates {
  total: number;
  count: number;
  mean: number;
  median: number;
  stdDev: number;
}

// Median Absolute Deviation — robust spread estimate, not skewed by extreme outliers
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

// Modified z-score using MAD. Factor 0.6745 ≈ Φ⁻¹(0.75) — makes it comparable to
// standard z-scores for normal distributions. Use this when the category is skewed
// (|mean - median| / median > 0.25) so the mean-based z is unreliable.
export function madZScore(value: number, med: number, mad: number): number {
  if (mad === 0) return 0;
  return (0.6745 * (value - med)) / mad;
}

export function computeCategoryAggregates(amounts: number[]): CategoryAggregates {
  return {
    total: amounts.reduce((s, v) => s + v, 0),
    count: amounts.length,
    mean: mean(amounts),
    median: median(amounts),
    stdDev: populationStdDev(amounts),
  };
}
