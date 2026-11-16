import type { Cadence } from "../contracts";
import { addDays, addMonths } from "./dates";

export interface CadenceSpec {
  cadence: Cadence;
  /** Average cycle length in days. */
  periodDays: number;
  /** Range the median gap between charges must fall in to pick this cadence. */
  medianGap: [number, number];
  /** Range every single gap must fall in (a missed cycle is checked at 2x and 3x). */
  gap: [number, number];
  /** Calendar months per cycle, so monthly bills keep their day of the month. */
  months: number | null;
  perYear: number;
  minCharges: number;
  /**
   * Weekly and biweekly habits (the Monday coffee, the Saturday shop) look
   * like subscriptions, so these short cadences need more charges and a fixed
   * price, and are only trusted when the vendor has no other spending.
   */
  short: boolean;
}

export const CADENCES: readonly CadenceSpec[] = [
  { cadence: "weekly", periodDays: 7, medianGap: [6.5, 7.5], gap: [6, 8], months: null, perYear: 52, minCharges: 5, short: true },
  { cadence: "biweekly", periodDays: 14, medianGap: [13, 15], gap: [12, 16], months: null, perYear: 26, minCharges: 4, short: true },
  { cadence: "monthly", periodDays: 30.44, medianGap: [27, 33], gap: [25, 35], months: 1, perYear: 12, minCharges: 3, short: false },
  { cadence: "quarterly", periodDays: 91.31, medianGap: [85, 97], gap: [80, 102], months: 3, perYear: 4, minCharges: 3, short: false },
  { cadence: "annual", periodDays: 365.25, medianGap: [355, 375], gap: [350, 380], months: 12, perYear: 1, minCharges: 2, short: false },
];

export function cadenceSpec(cadence: Cadence): CadenceSpec {
  const spec = CADENCES.find((c) => c.cadence === cadence);
  if (!spec) throw new RangeError(`Unknown cadence: ${cadence}`);
  return spec;
}

export function cadenceForMedianGap(medianGap: number): CadenceSpec | null {
  return CADENCES.find((c) => medianGap >= c.medianGap[0] && medianGap <= c.medianGap[1]) ?? null;
}

/** How many cycles a gap spans (1, 2 or 3), or null when it fits none. */
export function cyclesInGap(gap: number, spec: CadenceSpec): number | null {
  for (const cycles of [1, 2, 3]) {
    if (gap >= spec.gap[0] * cycles && gap <= spec.gap[1] * cycles) return cycles;
  }
  return null;
}

/** The date `cycles` cycles after `from`, keeping a monthly bill's day of the month. */
export function advance(from: string, spec: CadenceSpec, cycles: number, billingDay?: number): string {
  return spec.months === null
    ? addDays(from, spec.periodDays * cycles)
    : addMonths(from, spec.months * cycles, billingDay);
}
