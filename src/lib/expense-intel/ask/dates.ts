// Calendar helpers for Ask. Isomorphic and timezone-free: every date is an
// ISO "YYYY-MM-DD" string and arithmetic runs in UTC.
import type { DateRange, Period } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return toIso(parse(value)) === value;
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ymd(year: number, monthIndex: number, day: number): string {
  return toIso(new Date(Date.UTC(year, monthIndex, day)));
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** "YYYY-MM" for a date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Every "YYYY-MM" from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7)) - 1;
  const last = monthKey(to);
  for (;;) {
    const key = ymd(year, month, 1).slice(0, 7);
    if (key > last) return months;
    months.push(key);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
}

/** "October 2026" for "2026-10". */
export function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** "Oct 3, 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`;
}

function monthRange(year: number, monthIndex: number): DateRange {
  return { from: ymd(year, monthIndex, 1), to: ymd(year, monthIndex + 1, 0) };
}

function quarterRange(year: number, quarter: number): DateRange {
  return { from: ymd(year, quarter * 3, 1), to: ymd(year, quarter * 3 + 3, 0) };
}

/**
 * Resolve a period to inclusive dates relative to `today`. Periods that
 * include today end today; "last_*" calendar periods are complete. Returns
 * null for all time.
 */
export function resolvePeriod(
  period: Period,
  today: string,
  custom: DateRange = { from: null, to: null },
): DateRange | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const quarter = Math.floor(month / 3);
  switch (period) {
    case "all_time":
      return null;
    case "this_month":
      return { from: ymd(year, month, 1), to: today };
    case "last_month":
      return monthRange(year, month - 1);
    case "this_quarter":
      return { from: quarterRange(year, quarter).from, to: today };
    case "last_quarter":
      return quarter === 0 ? quarterRange(year - 1, 3) : quarterRange(year, quarter - 1);
    case "this_year":
      return { from: ymd(year, 0, 1), to: today };
    case "last_year":
      return { from: ymd(year - 1, 0, 1), to: ymd(year - 1, 11, 31) };
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "last_12_months":
      return { from: addDays(ymd(year - 1, month, Number(today.slice(8, 10))), 1), to: today };
    case "custom":
      return custom.from || custom.to ? { from: custom.from, to: custom.to } : null;
  }
}

export function inRange(date: string, range: DateRange | null): boolean {
  if (!range) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function isMonthStart(iso: string): boolean {
  return iso.endsWith("-01");
}

function isMonthEnd(iso: string): boolean {
  return addDays(iso, 1).endsWith("-01");
}

/** Plain-English phrase for a range: "in October 2026", "in Q3 2026", "from Oct 3, 2026 to Nov 2, 2026". */
export function describeRange(range: DateRange | null): string {
  if (!range) return "";
  const { from, to } = range;
  if (from && to) {
    if (isMonthStart(from) && isMonthEnd(to)) {
      const months = monthsBetween(from, to);
      const year = from.slice(0, 4);
      if (months.length === 1) return `in ${monthLabel(months[0])}`;
      if (months.length === 12 && from.endsWith("-01-01")) return `in ${year}`;
      const startMonth = Number(from.slice(5, 7));
      if (months.length === 3 && startMonth % 3 === 1)
        return `in Q${(startMonth + 2) / 3} ${year}`;
    }
    if (from === to) return `on ${formatDate(from)}`;
    return `from ${formatDate(from)} to ${formatDate(to)}`;
  }
  if (from) return `since ${formatDate(from)}`;
  if (to) return `up to ${formatDate(to)}`;
  return "";
}
