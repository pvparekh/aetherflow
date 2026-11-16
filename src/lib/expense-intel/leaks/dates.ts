// Calendar arithmetic on ISO dates (YYYY-MM-DD) in UTC. No clocks: every date
// comes from the caller so reports are reproducible.

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return fromDayNumber(dayNumber(value)) === value;
}

/** Days since 1970-01-01. */
export function dayNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(days: number): string {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + Math.round(days));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds calendar months, landing on `dayOfMonth` (default: the source day),
 * clamped to the month's length so a 31st bill falls on Feb 28 or 29.
 */
export function addMonths(iso: string, months: number, dayOfMonth?: number): string {
  const [y, m, d] = parts(iso);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const day = Math.min(dayOfMonth ?? d, daysInMonth(year, monthIndex));
  return fromDayNumber(Math.round(Date.UTC(year, monthIndex, day) / MS_PER_DAY));
}

export function dayOfMonth(iso: string): number {
  return parts(iso)[2];
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}
