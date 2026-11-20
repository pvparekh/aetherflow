// Calendar-month arithmetic on ISO strings. Isomorphic and clock-free:
// every "today" is passed in by the caller.

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a calendar month written as YYYY-MM. */
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const month = monthOf(value);
  const day = Number(value.slice(8, 10));
  return isMonth(month) && day >= 1 && day <= daysInMonth(month);
}

/** The YYYY-MM month an ISO date falls in. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/**
 * Days of `month` that have passed as of `asOf`, counting `asOf` itself.
 * 0 before the month starts, the whole month once it has ended.
 */
export function daysElapsed(month: string, asOf: string): number {
  const asOfMonth = monthOf(asOf);
  if (asOfMonth < month) return 0;
  if (asOfMonth > month) return daysInMonth(month);
  return Number(asOf.slice(8, 10));
}
