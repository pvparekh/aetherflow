// Monthly budget progress. Pure, deterministic and isomorphic: the demo runs
// it in the browser, the budgets route runs it on the server.
import type { Txn } from "../contracts";
import { CATEGORIES } from "../types";
import { daysElapsed, daysInMonth, monthOf } from "./month";

/** A user's monthly spending target for one canonical category. */
export interface BudgetTarget {
  category: string;
  monthly_target: number;
}

export type BudgetStatus = "under" | "near" | "over";

export interface BudgetProgress {
  category: string;
  /** Calendar month the figures cover, YYYY-MM. */
  month: string;
  target: number;
  spent: number;
  /** target - spent; negative once the budget is exceeded. */
  remaining: number;
  /** spent / target as a whole percentage. */
  percentUsed: number;
  /**
   * Linear month-end estimate from the days elapsed so far. Null when fewer
   * than MIN_DAYS_TO_PROJECT days have passed, where a straight line would
   * swing wildly on a single purchase.
   */
  projected: number | null;
  status: BudgetStatus;
}

/** Share of the target at which a budget is reported as "near". */
export const NEAR_THRESHOLD = 0.85;
/** Minimum elapsed days before a month-end projection is shown. */
export const MIN_DAYS_TO_PROJECT = 5;

/**
 * Progress of each budget in `month` (YYYY-MM) as of the ISO date `asOf`.
 * Results follow the canonical category order.
 */
export function budgetProgress(
  txns: readonly Txn[],
  budgets: readonly BudgetTarget[],
  month: string,
  asOf: string,
): BudgetProgress[] {
  const spentCents = spentCentsByCategory(txns, month);
  return [...budgets]
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
    .map((budget) => {
      const spent = fromCents(spentCents.get(budget.category) ?? 0);
      const target = budget.monthly_target;
      return {
        category: budget.category,
        month,
        target,
        spent,
        remaining: fromCents(toCents(target) - toCents(spent)),
        percentUsed: Math.round((spent / target) * 100),
        projected: projectMonthEnd(spent, month, asOf),
        status: budgetStatus(spent, target),
      };
    });
}

export function budgetStatus(spent: number, target: number): BudgetStatus {
  if (spent > target) return "over";
  if (spent >= target * NEAR_THRESHOLD) return "near";
  return "under";
}

/** Straight-line month-end spend, or null too early in the month. */
export function projectMonthEnd(
  spent: number,
  month: string,
  asOf: string,
): number | null {
  const elapsed = daysElapsed(month, asOf);
  if (elapsed < MIN_DAYS_TO_PROJECT) return null;
  return fromCents(Math.round((toCents(spent) / elapsed) * daysInMonth(month)));
}

/**
 * The month a budget view should open on: the month of the user's latest
 * transaction (statements usually lag the calendar), else the month of `today`.
 */
export function defaultBudgetMonth(txns: readonly Txn[], today: string): string {
  const latest = txns.reduce<string | null>(
    (max, t) => (max === null || t.date > max ? t.date : max),
    null,
  );
  return monthOf(latest ?? today);
}

function spentCentsByCategory(txns: readonly Txn[], month: string) {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (monthOf(t.date) !== month) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + toCents(t.amount));
  }
  return totals;
}

function categoryRank(category: string): number {
  const rank = (CATEGORIES as readonly string[]).indexOf(category);
  return rank === -1 ? CATEGORIES.length : rank;
}

// Sums run in integer cents so many small charges do not drift.
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}
