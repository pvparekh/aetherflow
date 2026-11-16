// Builds the leak report from all of a user's transactions. Pure and
// deterministic: the only notion of "now" is the `today` argument.
import type { LeakReport, LeakTotals, PriceChange, RecurringStream, Txn } from "../contracts";
import { daysBetween, isIsoDate, minDate } from "./dates";
import { detectDuplicates } from "./duplicates";
import { roundCents, sum } from "./money";
import { byDateThenId, detectRecurring } from "./recurring";
import { detectUnusual } from "./unusual";

const DAYS_PER_MONTH = 30.44;
const MIN_MONTHS_FOR_SUBSCRIPTIONS = 3;
const MONTHS_FOR_ANNUAL_PLANS = 12;

export function buildLeakReport(txns: Txn[], today: string): LeakReport {
  if (!isIsoDate(today)) throw new RangeError(`today must be YYYY-MM-DD, got "${today}"`);
  const dated = txns.filter((t) => isIsoDate(t.date)).sort(byDateThenId);
  const periodStart = dated[0]?.date ?? null;
  const periodEnd = dated.at(-1)?.date ?? null;
  const monthsCovered = coveredMonths(periodStart, periodEnd);

  // Overdue charges are judged up to the last statement date, never past today.
  const horizon = periodEnd ? minDate(periodEnd, today) : today;
  const detected = detectRecurring(dated, today, horizon);
  const subscriptions = detected.map((d) => d.stream).sort(byAnnualCost);
  const priceChanges = detected
    .flatMap((d) => (d.priceChange ? [d.priceChange] : []))
    .sort(byAnnualImpact);

  const recurringIds = new Set(subscriptions.flatMap((s) => s.transactionIds));
  const duplicates = detectDuplicates(dated, recurringIds).sort(
    (a, b) => b.extraCost - a.extraCost || a.dates[0].localeCompare(b.dates[0]) || a.vendorKey.localeCompare(b.vendorKey),
  );
  const flaggedIds = new Set([...recurringIds, ...duplicates.flatMap((d) => d.transactionIds)]);
  const unusual = detectUnusual(dated, flaggedIds);

  return {
    generatedAt: today,
    periodStart,
    periodEnd,
    monthsCovered,
    transactionCount: dated.length,
    subscriptions,
    priceChanges,
    duplicates,
    unusual,
    totals: totalsFor(subscriptions, priceChanges, duplicates.map((d) => d.extraCost)),
    coverageNote: coverageNote(dated.length, monthsCovered),
  };
}

function coveredMonths(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  return Math.round(((daysBetween(start, end) + 1) / DAYS_PER_MONTH) * 10) / 10;
}

function totalsFor(
  subscriptions: RecurringStream[],
  priceChanges: PriceChange[],
  duplicateCosts: number[],
): LeakTotals {
  const subscriptionsAnnual = roundCents(
    sum(subscriptions.filter((s) => s.status === "active").map((s) => s.annualCost)),
  );
  const priceIncreasesAnnual = roundCents(sum(priceChanges.map((p) => p.annualImpact)));
  const duplicatesTotal = roundCents(sum(duplicateCosts));
  return {
    subscriptionsMonthly: roundCents(subscriptionsAnnual / 12),
    subscriptionsAnnual,
    priceIncreasesAnnual,
    duplicatesTotal,
    // Only money already lost or locked in: no estimate of what might be saved.
    foundAnnual: roundCents(priceIncreasesAnnual + duplicatesTotal),
  };
}

function coverageNote(count: number, months: number): string | null {
  if (count === 0) return "No dated expenses yet. Upload a few months of statements to find leaks.";
  if (months < MIN_MONTHS_FOR_SUBSCRIPTIONS)
    return "Your statements cover less than 3 months. Upload at least 3 months to find subscriptions reliably.";
  if (months < MONTHS_FOR_ANNUAL_PLANS)
    return "Yearly subscriptions show up once your statements cover more than 12 months.";
  return null;
}

function byAnnualCost(a: RecurringStream, b: RecurringStream): number {
  return (
    Number(a.status !== "active") - Number(b.status !== "active") ||
    b.annualCost - a.annualCost ||
    a.key.localeCompare(b.key)
  );
}

function byAnnualImpact(a: PriceChange, b: PriceChange): number {
  return b.annualImpact - a.annualImpact || a.streamKey.localeCompare(b.streamKey);
}
