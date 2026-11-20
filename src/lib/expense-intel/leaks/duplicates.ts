// Duplicate charges: the same vendor charging the same amount again within
// 3 days. Skipped, to avoid false alarms:
// - payments to people, cash and housing (two equal transfers are normal);
// - the same row appearing in two overlapping statement uploads;
// - amounts that normally come in multiples (two seats billed together);
// - habitual purchases: the same amount bought at least twice before outside
//   any subscription (the usual coffee bought twice in a weekend).
import type { DuplicateCharge, Txn } from "../contracts";
import { daysBetween } from "./dates";
import { groupBy } from "./group";
import { cents, median, roundCents } from "./money";
import { isNonMerchant } from "./payees";
import { byDateThenId, SAME_CYCLE_DAYS } from "./recurring";

const HABIT_MIN_OTHER_PURCHASES = 2;

export function detectDuplicates(txns: Txn[], recurringIds: ReadonlySet<string>): DuplicateCharge[] {
  const merchants = txns.filter((t) => t.vendorKey && !isNonMerchant(t));
  const groups = groupBy(merchants, (t) => `${t.vendorKey}|${cents(t.amount)}`);

  const duplicates: DuplicateCharge[] = [];
  for (const group of groups.values()) {
    const windows = chargeWindows(withoutOverlappingImports(group.sort(byDateThenId)));
    windows.forEach((window, i) => {
      if (window.length < 2) return;
      const others = windows.filter((_, j) => j !== i);
      if (comesInMultiples(others) || isHabit(others, recurringIds)) return;
      duplicates.push(toDuplicate(window));
    });
  }
  return duplicates;
}

/**
 * Overlapping statements repeat a row with the same date in a second upload.
 * A real double charge appears twice in the same statement, or on different
 * days.
 */
function withoutOverlappingImports(group: Txn[]): Txn[] {
  return group.filter(
    (txn, i) =>
      !group
        .slice(0, i)
        .some((earlier) => earlier.date === txn.date && earlier.uploadId !== txn.uploadId),
  );
}

/** Charges within 3 days of a window's first charge share the window. */
function chargeWindows(group: Txn[]): Txn[][] {
  const windows: Txn[][] = [];
  for (const txn of group) {
    const current = windows.at(-1);
    if (current && daysBetween(current[0].date, txn.date) <= SAME_CYCLE_DAYS) current.push(txn);
    else windows.push([txn]);
  }
  return windows;
}

function comesInMultiples(others: Txn[][]): boolean {
  return others.length > 0 && median(others.map((w) => w.length)) >= 2;
}

function isHabit(others: Txn[][], recurringIds: ReadonlySet<string>): boolean {
  const recurring = others.some((w) => w.some((t) => recurringIds.has(t.id)));
  return !recurring && others.length >= HABIT_MIN_OTHER_PURCHASES;
}

function toDuplicate(window: Txn[]): DuplicateCharge {
  const latest = window.at(-1)!;
  return {
    vendor: latest.vendor,
    vendorKey: latest.vendorKey,
    amount: latest.amount,
    dates: window.map((t) => t.date),
    transactionIds: window.map((t) => t.id),
    extraCost: roundCents(latest.amount * (window.length - 1)),
  };
}
