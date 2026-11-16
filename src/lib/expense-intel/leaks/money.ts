import { median } from "../stats/aggregates";

export { median };

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function cents(value: number): number {
  return Math.round(value * 100);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(value: number): string {
  return usd.format(value);
}

/**
 * Two charges are the same price when they differ by at most 5 cents or 1%.
 * Subscriptions bill exact amounts; the slack absorbs small sales-tax changes.
 */
export function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.05, 0.01 * Math.max(a, b));
}

/** True when `value` is within `fraction` of `reference` (0.15 = 15%). */
export function withinFraction(value: number, reference: number, fraction: number): boolean {
  return Math.abs(value - reference) <= fraction * reference;
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
