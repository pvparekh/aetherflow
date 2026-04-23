import type { TrendDirection } from '../types';

// Requires exactly 3 values each side. Returns 'stable' with insufficient data.
// Up = recent avg >10% higher than prior avg. Down = >10% lower.
export function computeTrendDirection(
  recentTotals: number[],
  priorTotals: number[]
): TrendDirection {
  if (recentTotals.length < 3 || priorTotals.length < 3) return 'stable';

  const recentAvg = recentTotals.reduce((s, v) => s + v, 0) / recentTotals.length;
  const priorAvg = priorTotals.reduce((s, v) => s + v, 0) / priorTotals.length;

  if (priorAvg === 0) return 'stable';

  const changePct = (recentAvg - priorAvg) / priorAvg;
  if (changePct > 0.1) return 'up';
  if (changePct < -0.1) return 'down';
  return 'stable';
}

// |mean - median| / |median| > 0.25 → distribution is skewed by a large outlier
export function isSkewedByOutliers(mean: number, median: number): boolean {
  if (median === 0) return false;
  return Math.abs(mean - median) / Math.abs(median) > 0.25;
}

// Delta in percentage points between this upload's category share and historical average
export function computeCategoryDrift(currentPct: number, historicalAvgPct: number): number {
  return currentPct - historicalAvgPct;
}
