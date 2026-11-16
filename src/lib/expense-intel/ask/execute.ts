// Query executor. Pure and isomorphic: the server route and the browser demo
// run the same code. Every number an Ask answer shows comes from here.
import type { LeakReport, Txn } from "../contracts";
import { inRange, monthKey, monthLabel, monthsBetween, resolvePeriod } from "./dates";
import type {
  AskFilters,
  AskQuery,
  AskResult,
  AskRow,
  AskSummary,
  DataSpan,
  DateRange,
  RecurringSource,
} from "./types";

export interface RunOptions {
  /** ISO date that relative periods resolve against. Defaults to the latest expense date. */
  today?: string;
  /**
   * The leak engine's report, used for `recurringOnly`. Without it, a vendor
   * counts as recurring when it was charged in 3 or more distinct months.
   */
  report?: LeakReport | null;
}

/** Without a leak report, a vendor charged in this many distinct months counts as recurring. */
export const REPEAT_MONTHS_FOR_RECURRING = 3;

const cents = (n: number) => Math.round(n * 100) / 100;

export function dataSpan(txns: Txn[]): DataSpan | null {
  if (txns.length === 0) return null;
  let from = txns[0].date;
  let to = txns[0].date;
  for (const t of txns) {
    if (t.date < from) from = t.date;
    if (t.date > to) to = t.date;
  }
  return { from, to };
}

// --- Filtering ------------------------------------------------------------

type RecurringTest = (t: Txn) => boolean;

function recurringFromReport(report: LeakReport): RecurringTest {
  const ids = new Set(report.subscriptions.flatMap((s) => s.transactionIds));
  return (t) => ids.has(t.id);
}

function recurringFromRepeatMonths(txns: Txn[]): RecurringTest {
  const months = new Map<string, Set<string>>();
  for (const t of txns) {
    const seen = months.get(t.vendorKey) ?? new Set<string>();
    seen.add(monthKey(t.date));
    months.set(t.vendorKey, seen);
  }
  return (t) => (months.get(t.vendorKey)?.size ?? 0) >= REPEAT_MONTHS_FOR_RECURRING;
}

/** Lowercase letters and digits only, so "Uber Eats" matches "ubereats". */
function searchable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function matchesFilters(
  t: Txn,
  filters: AskFilters,
  range: DateRange | null,
  isRecurring: RecurringTest | null,
): boolean {
  if (!inRange(t.date, range)) return false;
  if (filters.categories.length > 0 && !(filters.categories as string[]).includes(t.category))
    return false;
  if (filters.minAmount !== null && t.amount < filters.minAmount) return false;
  if (filters.maxAmount !== null && t.amount > filters.maxAmount) return false;
  if (filters.vendorText) {
    const needle = searchable(filters.vendorText);
    if (!searchable(t.vendor).includes(needle) && !searchable(t.vendorKey).includes(needle))
      return false;
  }
  if (isRecurring && !isRecurring(t)) return false;
  return true;
}

// --- Aggregation ----------------------------------------------------------

function summarise(txns: Txn[]): AskSummary {
  let total = 0;
  let largest: Txn | null = null;
  for (const t of txns) {
    total += t.amount;
    if (!largest || t.amount > largest.amount) largest = t;
  }
  return {
    count: txns.length,
    total: cents(total),
    average: txns.length ? cents(total / txns.length) : 0,
    largest,
  };
}

function rowValue(metric: AskQuery["metric"], summary: AskSummary): number {
  switch (metric) {
    case "count":
      return summary.count;
    case "average":
      return summary.average;
    case "max":
      return summary.largest?.amount ?? 0;
    case "sum":
    case "list":
      return summary.total;
  }
}

function aggregateRow(
  key: string,
  label: string,
  date: string | null,
  txns: Txn[],
  metric: AskQuery["metric"],
): AskRow {
  const summary = summarise(txns);
  return {
    key,
    label,
    value: rowValue(metric, summary),
    count: summary.count,
    total: summary.total,
    date,
    transactionId: metric === "max" ? (summary.largest?.id ?? null) : null,
  };
}

function groupBy(txns: Txn[], keyOf: (t: Txn) => string): Map<string, Txn[]> {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const key = keyOf(t);
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

function latestDate(txns: Txn[]): string | null {
  return txns.reduce<string | null>((max, t) => (max && max > t.date ? max : t.date), null);
}

/** The display name used most often for a vendor key (ties: alphabetical). */
function commonestName(txns: Txn[]): string {
  const counts = groupBy(txns, (t) => t.vendor);
  return [...counts.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )[0][0];
}

function listRows(matched: Txn[]): AskRow[] {
  return matched.map((t) => ({
    key: t.id,
    label: t.vendor,
    value: t.amount,
    count: 1,
    total: t.amount,
    date: t.date,
    transactionId: t.id,
  }));
}

/**
 * Totals and counts show months with no matching spending as zero, within
 * the requested period clipped to the data, so averages per month are honest.
 */
function monthWindow(range: DateRange | null, span: DataSpan): string[] {
  const from = range?.from && range.from > span.from ? range.from : span.from;
  const to = range?.to && range.to < span.to ? range.to : span.to;
  return from <= to ? monthsBetween(from, to) : [];
}

function monthRows(
  matched: Txn[],
  query: AskQuery,
  range: DateRange | null,
  span: DataSpan,
): AskRow[] {
  const groups = groupBy(matched, (t) => monthKey(t.date));
  const zeroFill = query.metric === "sum" || query.metric === "count";
  const keys = zeroFill
    ? [...new Set([...monthWindow(range, span), ...groups.keys()])].sort()
    : [...groups.keys()];
  return keys.map((key) =>
    aggregateRow(key, monthLabel(key), `${key}-01`, groups.get(key) ?? [], query.metric),
  );
}

function buildRows(
  matched: Txn[],
  query: AskQuery,
  range: DateRange | null,
  span: DataSpan | null,
): AskRow[] {
  if (matched.length === 0 || !span) return [];
  if (query.metric === "list") return listRows(matched);
  switch (query.groupBy) {
    case "none":
      return [aggregateRow("all", "All matching expenses", latestDate(matched), matched, query.metric)];
    case "category":
      return [...groupBy(matched, (t) => t.category)].map(([key, txns]) =>
        aggregateRow(key, key, latestDate(txns), txns, query.metric),
      );
    case "vendor":
      return [...groupBy(matched, (t) => t.vendorKey)].map(([key, txns]) =>
        aggregateRow(key, commonestName(txns), latestDate(txns), txns, query.metric),
      );
    case "month":
      return monthRows(matched, query, range, span);
  }
}

function compareRows(sort: AskQuery["sort"]): (a: AskRow, b: AskRow) => number {
  const byDate = (a: AskRow, b: AskRow) => (a.date ?? "").localeCompare(b.date ?? "");
  const byKey = (a: AskRow, b: AskRow) => a.key.localeCompare(b.key);
  switch (sort) {
    case "value_desc":
      return (a, b) => b.value - a.value || byKey(a, b);
    case "value_asc":
      return (a, b) => a.value - b.value || byKey(a, b);
    case "newest":
      return (a, b) => byDate(b, a) || byKey(a, b);
    case "oldest":
      return (a, b) => byDate(a, b) || byKey(a, b);
  }
}

const newestFirst = (a: Txn, b: Txn) =>
  b.date.localeCompare(a.date) || b.amount - a.amount || a.id.localeCompare(b.id);

/** Execute a validated query over a user's expenses. Pure: same input, same output. */
export function runQuery(txns: Txn[], query: AskQuery, options: RunOptions = {}): AskResult {
  const span = dataSpan(txns);
  const today = options.today ?? span?.to ?? "1970-01-01";
  const { filters } = query;
  const range = resolvePeriod(filters.period, today, { from: filters.dateFrom, to: filters.dateTo });

  let recurringSource: RecurringSource | null = null;
  let isRecurring: RecurringTest | null = null;
  if (filters.recurringOnly) {
    recurringSource = options.report ? "leak_report" : "repeat_months";
    isRecurring = options.report
      ? recurringFromReport(options.report)
      : recurringFromRepeatMonths(txns);
  }

  const matched = txns
    .filter((t) => matchesFilters(t, filters, range, isRecurring))
    .sort(newestFirst);
  const rows = buildRows(matched, query, range, span).sort(compareRows(query.sort));

  return {
    query,
    range,
    dataSpan: span,
    rows: rows.slice(0, query.limit),
    totalRows: rows.length,
    overall: summarise(matched),
    transactions: matched,
    recurringSource,
  };
}
