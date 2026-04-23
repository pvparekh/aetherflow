import { describe, it, expect } from 'vitest';
import { mean, median, populationStdDev, computeCategoryAggregates } from '../aggregates';

describe('mean', () => {
  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });
  it('handles single element', () => {
    expect(mean([42])).toBe(42);
  });
  it('handles decimals', () => {
    expect(mean([1.5, 2.5])).toBe(2);
  });
});

describe('median', () => {
  it('returns middle value for odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('returns average of two middle values for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
  it('handles single element', () => {
    expect(median([7])).toBe(7);
  });
  it('is not affected by input order', () => {
    expect(median([5, 1, 9, 2, 7])).toBe(5);
  });
});

describe('populationStdDev', () => {
  // Classic textbook example: [2,4,4,4,5,5,7,9] → mean=5, stdDev=2
  it('computes the correct population std dev', () => {
    expect(populationStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });
  it('returns 0 for single element', () => {
    expect(populationStdDev([100])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(populationStdDev([])).toBe(0);
  });
  it('returns 0 when all values are identical', () => {
    expect(populationStdDev([50, 50, 50])).toBe(0);
  });
  it('is always non-negative', () => {
    expect(populationStdDev([1, 100, 50, 25])).toBeGreaterThanOrEqual(0);
  });
});

describe('computeCategoryAggregates', () => {
  it('returns correct aggregates for a simple set', () => {
    const result = computeCategoryAggregates([100, 200, 300]);
    expect(result.total).toBe(600);
    expect(result.count).toBe(3);
    expect(result.mean).toBe(200);
    expect(result.median).toBe(200);
    // stdDev: mean=200, deviations: [-100, 0, 100], variance=20000/3≈6666.67, stdDev≈81.65
    expect(result.stdDev).toBeCloseTo(81.65, 1);
  });
  it('handles a single item', () => {
    const result = computeCategoryAggregates([500]);
    expect(result.total).toBe(500);
    expect(result.count).toBe(1);
    expect(result.mean).toBe(500);
    expect(result.median).toBe(500);
    expect(result.stdDev).toBe(0);
  });
});
