import { describe, it, expect } from 'vitest';
import { computeZScore, getAnomalySeverity } from '../zscore';

describe('computeZScore', () => {
  it('returns 0 when amount equals the mean', () => {
    expect(computeZScore(200, 200, 50)).toBe(0);
  });
  it('returns positive z for amount above mean', () => {
    expect(computeZScore(300, 200, 50)).toBe(2);
  });
  it('returns negative z for amount below mean', () => {
    expect(computeZScore(100, 200, 50)).toBe(-2);
  });
  it('returns 0 when stdDev is 0 (avoids division by zero)', () => {
    expect(computeZScore(500, 100, 0)).toBe(0);
  });
  it('computes correctly for a high outlier', () => {
    // amount=650, mean=200, stdDev=50 → z=(650-200)/50=9
    expect(computeZScore(650, 200, 50)).toBe(9);
  });
});

describe('getAnomalySeverity', () => {
  it('returns none for |z| < 1', () => {
    expect(getAnomalySeverity(0)).toBe('none');
    expect(getAnomalySeverity(0.99)).toBe('none');
    expect(getAnomalySeverity(-0.5)).toBe('none');
  });
  it('returns low for 1 ≤ |z| < 2', () => {
    expect(getAnomalySeverity(1)).toBe('low');
    expect(getAnomalySeverity(1.99)).toBe('low');
    expect(getAnomalySeverity(-1.5)).toBe('low');
  });
  it('returns medium for 2 ≤ |z| < 3', () => {
    expect(getAnomalySeverity(2)).toBe('medium');
    expect(getAnomalySeverity(2.99)).toBe('medium');
    expect(getAnomalySeverity(-2.5)).toBe('medium');
  });
  it('returns high for |z| ≥ 3', () => {
    expect(getAnomalySeverity(3)).toBe('high');
    expect(getAnomalySeverity(9)).toBe('high');
    expect(getAnomalySeverity(-3.1)).toBe('high');
  });
});
