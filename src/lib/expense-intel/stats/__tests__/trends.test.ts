import { describe, it, expect } from 'vitest';
import { computeTrendDirection, isSkewedByOutliers, computeCategoryDrift } from '../trends';

describe('computeTrendDirection', () => {
  it('returns up when recent avg is >10% above prior avg', () => {
    // recentAvg=120, priorAvg=100, change=+20%
    expect(computeTrendDirection([110, 120, 130], [100, 100, 100])).toBe('up');
  });
  it('returns down when recent avg is >10% below prior avg', () => {
    // recentAvg=85, priorAvg=100, change=-15%
    expect(computeTrendDirection([80, 90, 85], [100, 100, 100])).toBe('down');
  });
  it('returns stable when change is within ±10%', () => {
    // recentAvg=100, priorAvg=100, change=0%
    expect(computeTrendDirection([100, 100, 100], [100, 100, 100])).toBe('stable');
    // recentAvg=108, priorAvg=100, change=+8% — just under threshold
    expect(computeTrendDirection([104, 108, 112], [100, 100, 100])).toBe('stable');
    // recentAvg=92, priorAvg=100, change=-8%
    expect(computeTrendDirection([90, 92, 94], [100, 100, 100])).toBe('stable');
  });
  it('returns stable at exactly the 10% boundary (exclusive)', () => {
    // change = exactly +10% → not > 0.1 → stable
    expect(computeTrendDirection([110, 110, 110], [100, 100, 100])).toBe('stable');
  });
  it('returns stable when there is insufficient data', () => {
    expect(computeTrendDirection([110, 120], [100, 100, 100])).toBe('stable');
    expect(computeTrendDirection([], [])).toBe('stable');
    expect(computeTrendDirection([110, 120, 130], [100, 100])).toBe('stable');
  });
  it('returns stable when prior avg is 0', () => {
    expect(computeTrendDirection([100, 100, 100], [0, 0, 0])).toBe('stable');
  });
  it('handles the strict >10% up threshold', () => {
    // recentAvg=111, priorAvg=100, change=+11%
    expect(computeTrendDirection([111, 111, 111], [100, 100, 100])).toBe('up');
  });
  it('handles the strict >10% down threshold', () => {
    // recentAvg=89, priorAvg=100, change=-11%
    expect(computeTrendDirection([89, 89, 89], [100, 100, 100])).toBe('down');
  });
});

describe('isSkewedByOutliers', () => {
  it('returns true when |mean-median|/median > 0.25', () => {
    // |130-100|/100 = 0.30 > 0.25
    expect(isSkewedByOutliers(130, 100)).toBe(true);
  });
  it('returns false when |mean-median|/median ≤ 0.25', () => {
    // |120-100|/100 = 0.20 ≤ 0.25
    expect(isSkewedByOutliers(120, 100)).toBe(false);
    // identical
    expect(isSkewedByOutliers(100, 100)).toBe(false);
  });
  it('returns false when median is 0 (avoids division by zero)', () => {
    expect(isSkewedByOutliers(100, 0)).toBe(false);
  });
  it('handles negative divergence (mean below median)', () => {
    // |70-100|/100 = 0.30 > 0.25
    expect(isSkewedByOutliers(70, 100)).toBe(true);
  });
  it('is true just above the 0.25 boundary', () => {
    // |126-100|/100 = 0.26 > 0.25
    expect(isSkewedByOutliers(126, 100)).toBe(true);
  });
});

describe('computeCategoryDrift', () => {
  it('returns positive delta when current is higher', () => {
    expect(computeCategoryDrift(35, 20)).toBe(15);
  });
  it('returns negative delta when current is lower', () => {
    expect(computeCategoryDrift(10, 25)).toBe(-15);
  });
  it('returns 0 when equal', () => {
    expect(computeCategoryDrift(20, 20)).toBe(0);
  });
});
