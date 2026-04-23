import type { AnomalySeverity } from '../types';

export function computeZScore(amount: number, categoryMean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (amount - categoryMean) / stdDev;
}

// Thresholds: <1 none, 1–2 low, 2–3 medium, ≥3 high
export function getAnomalySeverity(zScore: number): AnomalySeverity {
  const abs = Math.abs(zScore);
  if (abs >= 3) return 'high';
  if (abs >= 2) return 'medium';
  if (abs >= 1) return 'low';
  return 'none';
}
