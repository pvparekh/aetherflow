// Recurring charge detection.
//
// A vendor's charges form a recurring stream only when they arrive on a
// steady cadence AND at a steady price. Repetition alone is not enough: rent,
// groceries and the weekly coffee all repeat. The rules, strictest first:
//
// 1. Housing, transfers and cash never qualify (see payees.ts).
// 2. Every gap between charges must fit the cadence; one missed cycle is
//    tolerated (a statement month the user did not upload).
// 3. The price must hold. It may step up or down once a new price repeats.
//    Varying amounts (within 15%) are accepted only for bill-like categories
//    on a steady billing day, such as a utility or a usage-billed SaaS.
// 4. Weekly and biweekly streams need a fixed price, more charges, and a
//    vendor with no other spending.
import type { PriceChange, RecurringStream, Txn } from "../contracts";
import { advance, cadenceForMedianGap, cyclesInGap, type CadenceSpec } from "./cadence";
import { dayOfMonth, daysBetween } from "./dates";
import { groupBy } from "./group";
import { cents, median, roundCents, samePrice, sum, withinFraction } from "./money";
import { canBeSubscription } from "./payees";

export interface DetectedStream {
  stream: RecurringStream;
  /** A confirmed price increase, or null. */
  priceChange: PriceChange | null;
}

interface Level {
  start: number;
  end: number;
}

interface Fit {
  spec: CadenceSpec;
  charges: Txn[];
  missedCycles: number;
  levels: Level[];
  fixedPrice: boolean;
}

interface PriceIncrease {
  previousAmount: number;
  newAmount: number;
  changedOn: string;
}

/** Charges this many days apart or fewer belong to the same billing cycle. */
export const SAME_CYCLE_DAYS = 3;
const VARIABLE_BILL_CATEGORIES = new Set(["Utilities", "Software/SaaS", "Marketing/Ads"]);
const VARIABLE_TOLERANCE = 0.15;
const ANNUAL_RENEWAL_CATEGORIES = new Set(["Software/SaaS", "Utilities", "Marketing/Ads", "Entertainment"]);
const MAX_RENEWAL_CHANGE = 1.5;
/** A variable bill's single-cycle gaps stay within this many days of their median. */
const VARIABLE_GAP_SPREAD = 4;
const MAX_LEVELS = 3;
const MAX_GAPS_WITH_MISSED_CYCLES = 1;
const OVERDUE_GRACE_DAYS = 7;
const MIN_INCREASE_USD = 0.5;
const MIN_INCREASE_FRACTION = 0.03;

export function byDateThenId(a: Txn, b: Txn): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

export function detectRecurring(txns: Txn[], today: string, horizon: string): DetectedStream[] {
  const eligible = txns.filter(
    (t) => t.vendorKey && t.vendorKey !== "unknown" && canBeSubscription(t),
  );
  const detected: DetectedStream[] = [];
  for (const charges of groupBy(eligible, (t) => t.vendorKey).values()) {
    charges.sort(byDateThenId);
    const fits = fitsForVendor(charges);
    detected.push(...withKeys(fits).map(({ fit, key }) => toDetectedStream(fit, key, today, horizon)));
  }
  return detected;
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

function fitsForVendor(charges: Txn[]): Fit[] {
  const whole = fitLanes(charges, true);
  if (whole.length > 0) return whole;
  // The vendor also has one-off spending (Amazon, Apple): look for exact-price
  // series inside it, and only at monthly or longer cadences.
  return samePriceChains(charges).flatMap((chain) => fitLanes(chain, false));
}

/** Groups charges into billing cycles: a charge within 3 days of a cycle's first charge joins it. */
function groupIntoCycles(charges: Txn[]): Txn[][] {
  const cycles: Txn[][] = [];
  for (const txn of charges) {
    const current = cycles.at(-1);
    if (current && daysBetween(current[0].date, txn.date) <= SAME_CYCLE_DAYS) current.push(txn);
    else cycles.push([txn]);
  }
  return cycles;
}

/**
 * Two seats billed together every month are two parallel streams, not a
 * duplicate. When most cycles hold the same number of charges, each position
 * becomes its own lane; otherwise one charge per cycle is kept (the closest to
 * the vendor's usual price) and any extra is left for the duplicate check.
 */
function splitIntoLanes(charges: Txn[]): Txn[][] {
  const cycles = groupIntoCycles(charges);
  const lanes = laneCount(cycles.map((c) => c.length));
  const usual = median(charges.map((c) => c.amount));
  const order =
    lanes === 1
      ? (a: Txn, b: Txn) => Math.abs(a.amount - usual) - Math.abs(b.amount - usual) || byDateThenId(a, b)
      : (a: Txn, b: Txn) => a.amount - b.amount || a.id.localeCompare(b.id);
  return Array.from({ length: lanes }, (_, lane) =>
    cycles.flatMap((cycle) => {
      const pick = [...cycle].sort(order)[lane];
      return pick ? [pick] : [];
    }),
  );
}

function laneCount(cycleSizes: number[]): number {
  const counts = new Map<number, number>();
  for (const size of cycleSizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  let mode = 1;
  let modeCount = 0;
  for (const [size, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count > modeCount) [mode, modeCount] = [size, count];
  }
  const dominant = modeCount >= 3 && modeCount >= 0.75 * cycleSizes.length;
  return mode >= 2 && dominant ? mode : 1;
}

function fitLanes(charges: Txn[], allowShortCadence: boolean): Fit[] {
  const lanes = splitIntoLanes(charges);
  // Any charge left out of every lane is other spending at this vendor.
  const onlyThisSeries = lanes.flat().length === charges.length;
  return lanes
    .map((lane) => fitStream(lane, allowShortCadence && onlyThisSeries))
    .filter((fit): fit is Fit => fit !== null);
}

/**
 * Exact-price series within a mixed vendor, sorted by first charge. A series
 * that stops is joined to a later one that starts one cycle after it, so a
 * price change does not read as a cancellation plus a new subscription.
 */
function samePriceChains(charges: Txn[]): Txn[][] {
  const series = [...groupBy(charges, (t) => cents(t.amount)).values()].sort((a, b) =>
    byDateThenId(a[0], b[0]),
  );

  const used = new Set<number>();
  const chains: Txn[][] = [];
  series.forEach((first, i) => {
    if (used.has(i)) return;
    let chain = first;
    for (let j = i + 1; j < series.length; j++) {
      const next = series[j];
      if (!used.has(j) && next.length >= 2 && continuesChain(chain, next[0])) {
        chain = [...chain, ...next];
        used.add(j);
      }
    }
    chains.push(chain);
  });
  return chains;
}

function continuesChain(chain: Txn[], nextCharge: Txn): boolean {
  const last = chain.at(-1)!;
  if (chain.length < 2 || nextCharge.date <= last.date) return false;
  const spec = cadenceForMedianGap(median(gapsBetween(chain)));
  return spec !== null && cyclesInGap(daysBetween(last.date, nextCharge.date), spec) === 1;
}

// ---------------------------------------------------------------------------
// Fitting one series
// ---------------------------------------------------------------------------

function gapsBetween(charges: Txn[]): number[] {
  return charges.slice(1).map((txn, i) => daysBetween(charges[i].date, txn.date));
}

function fitStream(charges: Txn[], allowShortCadence: boolean): Fit | null {
  if (charges.length < 2) return null;
  const gaps = gapsBetween(charges);
  const spec = cadenceForMedianGap(median(gaps));
  if (!spec || charges.length < spec.minCharges) return null;
  if (spec.short && !allowShortCadence) return null;

  const cycles = gaps.map((gap) => cyclesInGap(gap, spec));
  if (cycles.some((c) => c === null)) return null;
  const missedCycles = sum(cycles.map((c) => c! - 1));
  if (cycles.filter((c) => c! > 1).length > MAX_GAPS_WITH_MISSED_CYCLES) return null;

  const amounts = charges.map((c) => c.amount);
  const fixed = splitIntoLevels(amounts, samePrice);
  const twoAnnualPrices = isOnlyTwoAnnualCharges(spec, charges) && !samePrice(amounts[0], amounts[1]);
  if (twoAnnualPrices && !isPlausibleRenewal(charges)) return null;
  if (fixed) return { spec, charges, missedCycles, levels: fixed, fixedPrice: true };

  const singleCycleGaps = gaps.filter((_, i) => cycles[i] === 1);
  const variableAllowed =
    !spec.short &&
    VARIABLE_BILL_CATEGORIES.has(streamCategory(charges)) &&
    isSteady(singleCycleGaps, VARIABLE_GAP_SPREAD);
  if (!variableAllowed) return null;
  const variable = splitIntoLevels(amounts, (a, ref) => withinFraction(a, ref, VARIABLE_TOLERANCE));
  return variable ? { spec, charges, missedCycles, levels: variable, fixedPrice: false } : null;
}

function isOnlyTwoAnnualCharges(spec: CadenceSpec, charges: Txn[]): boolean {
  return spec.cadence === "annual" && charges.length === 2;
}

/**
 * Two charges a year apart at different prices are weak evidence: a store
 * visited every December fits too. Accept them as a renewal at a new price
 * only for subscription-like categories and a change of at most 50%.
 */
function isPlausibleRenewal([first, second]: Txn[]): boolean {
  const ratio = second.amount / first.amount;
  return (
    ANNUAL_RENEWAL_CATEGORIES.has(streamCategory([first, second])) &&
    ratio >= 1 / MAX_RENEWAL_CHANGE &&
    ratio <= MAX_RENEWAL_CHANGE
  );
}

function isSteady(values: number[], spread: number): boolean {
  const mid = median(values);
  return values.every((v) => Math.abs(v - mid) <= spread);
}

/**
 * Splits amounts into consecutive price levels. A charge off the current
 * level starts a new one only if the next charge repeats it (the latest charge
 * may start one on its own, pending confirmation). A one-off amount in the
 * middle means this is not a clean subscription series.
 */
function splitIntoLevels(amounts: number[], same: (amount: number, reference: number) => boolean): Level[] | null {
  const levels: Level[] = [{ start: 0, end: 1 }];
  for (let i = 1; i < amounts.length; i++) {
    const level = levels.at(-1)!;
    if (same(amounts[i], median(amounts.slice(level.start, level.end)))) {
      level.end = i + 1;
      continue;
    }
    const next = amounts[i + 1];
    if (next !== undefined && !same(next, amounts[i])) return null;
    levels.push({ start: i, end: i + 1 });
  }
  return levels.length <= MAX_LEVELS ? levels : null;
}

// ---------------------------------------------------------------------------
// Price increases
// ---------------------------------------------------------------------------

/**
 * The latest step up in price, confirmed by at least 2 charges at the new
 * price after at least 2 at the old one (1 and 1 for annual plans). The
 * 2-before rule keeps a cheaper prorated first charge from reading as an
 * increase.
 */
function findPriceIncrease(charges: Txn[], spec: CadenceSpec): PriceIncrease | null {
  const amounts = charges.map((c) => c.amount);
  const minRun = spec.cadence === "annual" ? 1 : 2;
  const newStart = runStart(amounts, amounts.length - 1);
  if (newStart === 0) return null;
  const previousStart = runStart(amounts, newStart - 1);

  const newRun = amounts.slice(newStart);
  const previousRun = amounts.slice(previousStart, newStart);
  if (newRun.length < minRun || previousRun.length < minRun) return null;

  const newAmount = roundCents(median(newRun));
  const previousAmount = roundCents(median(previousRun));
  const increase = newAmount - previousAmount;
  if (increase < Math.max(MIN_INCREASE_USD, MIN_INCREASE_FRACTION * previousAmount)) return null;
  return { previousAmount, newAmount, changedOn: charges[newStart].date };
}

/** First index of the run of same-price charges ending at `end`. */
function runStart(amounts: number[], end: number): number {
  let start = end;
  while (start > 0 && samePrice(amounts[start - 1], amounts[end])) start--;
  return start;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** vendorKey:cadence, with :2, :3 for further parallel streams, oldest first. */
function withKeys(fits: Fit[]): { fit: Fit; key: string }[] {
  const ordered = [...fits].sort(
    (a, b) => byDateThenId(a.charges[0], b.charges[0]) || a.charges[0].amount - b.charges[0].amount,
  );
  const seen = new Map<string, number>();
  return ordered.map((fit) => {
    const base = `${fit.charges[0].vendorKey}:${fit.spec.cadence}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { fit, key: n === 1 ? base : `${base}:${n}` };
  });
}

function toDetectedStream(fit: Fit, key: string, today: string, horizon: string): DetectedStream {
  const { spec, charges } = fit;
  const last = charges.at(-1)!;
  const increase = findPriceIncrease(charges, spec);
  const billingDay = usualBillingDay(charges);

  // Overdue is judged against the last date we have statements for, so old
  // uploads do not make every subscription look cancelled.
  const firstDue = advance(last.date, spec, 1, billingDay);
  const overdueDays = daysBetween(firstDue, horizon);
  const cancelled = overdueDays > spec.periodDays / 2 + OVERDUE_GRACE_DAYS;
  const nextExpectedDate = cancelled ? firstDue : nextDueOnOrAfter(last.date, spec, billingDay, today);

  const currentAmount = increase?.newAmount ?? currentLevelAmount(fit);
  const annualCost = roundCents(currentAmount * spec.perYear);
  const stream: RecurringStream = {
    key,
    vendor: last.vendor,
    vendorKey: last.vendorKey,
    category: streamCategory(charges),
    cadence: spec.cadence,
    typicalAmount: roundCents(median(charges.map((c) => c.amount))),
    lastAmount: last.amount,
    lastDate: last.date,
    nextExpectedDate,
    annualCost,
    occurrences: charges.length,
    confidence: isHighConfidence(fit) ? "high" : "medium",
    status: cancelled ? "possibly_cancelled" : "active",
    transactionIds: charges.map((c) => c.id),
  };

  const priceChange: PriceChange | null =
    increase && !cancelled
      ? {
          streamKey: key,
          vendor: stream.vendor,
          previousAmount: increase.previousAmount,
          newAmount: increase.newAmount,
          changedOn: increase.changedOn,
          pct: Math.round(((increase.newAmount - increase.previousAmount) / increase.previousAmount) * 1000) / 10,
          annualImpact: roundCents((increase.newAmount - increase.previousAmount) * spec.perYear),
        }
      : null;
  return { stream, priceChange };
}

/**
 * The current price: the latest level once it has repeated, else the median.
 * A variable bill's swings are seasonal, not price changes, so it uses the median.
 */
function currentLevelAmount(fit: Fit): number {
  const latest = fit.levels.at(-1)!;
  const amounts = fit.charges.map((c) => c.amount);
  const confirmed = fit.fixedPrice && latest.end - latest.start >= 2;
  return roundCents(median(confirmed ? amounts.slice(latest.start, latest.end) : amounts));
}

function isHighConfidence(fit: Fit): boolean {
  const enough = fit.spec.cadence === "annual" ? 3 : 4;
  return fit.fixedPrice && fit.missedCycles === 0 && fit.charges.length >= enough;
}

function nextDueOnOrAfter(lastDate: string, spec: CadenceSpec, billingDay: number, today: string): string {
  let due = advance(lastDate, spec, 1, billingDay);
  for (let cycles = 2; due < today; cycles++) due = advance(lastDate, spec, cycles, billingDay);
  return due;
}

/**
 * The most common day of the month among the last 3 charges, preferring the
 * later day on ties so a bill on the 31st is not pulled back by a short month.
 */
function usualBillingDay(charges: Txn[]): number {
  const days = charges.slice(-3).map((c) => dayOfMonth(c.date));
  const count = (d: number) => days.filter((x) => x === d).length;
  return days.reduce((best, d) => (count(d) > count(best) || (count(d) === count(best) && d > best) ? d : best));
}

/** Most frequent category, ties going to the latest charge's category. */
function streamCategory(charges: Txn[]): string {
  const counts = new Map<string, number>();
  for (const c of charges) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  let best = charges.at(-1)!.category;
  for (const [category, count] of counts) if (count > counts.get(best)!) best = category;
  return best;
}
