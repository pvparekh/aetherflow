// "Ask your spending" query language. Isomorphic.
//
// An `AskQuery` is the only thing the model is allowed to produce for a
// question. It is a small, closed language: every field is an enum, a bounded
// number, a date, or a short vendor search string. Code validates it
// (schema.ts), resolves its dates (dates.ts) and executes it (execute.ts).
import type { Txn } from "../contracts";
import type { Category } from "../types";

export const METRICS = ["sum", "count", "average", "max", "list"] as const;
export type Metric = (typeof METRICS)[number];

export const GROUP_BYS = ["none", "category", "vendor", "month"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

/** Rows by value, or by date (transaction date, month, or a group's latest charge). */
export const SORTS = ["value_desc", "value_asc", "newest", "oldest"] as const;
export type SortOrder = (typeof SORTS)[number];

/**
 * Relative periods are resolved by code against an explicit `today`, so the
 * model never does date arithmetic. `custom` uses `dateFrom` / `dateTo`.
 */
export const PERIODS = [
  "all_time",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "last_30_days",
  "last_90_days",
  "last_12_months",
  "custom",
] as const;
export type Period = (typeof PERIODS)[number];

export const MAX_LIMIT = 50;
export const MAX_VENDOR_TEXT = 60;

export interface AskFilters {
  /** Empty means every category. */
  categories: Category[];
  /** Case-insensitive search over the vendor name; null means any vendor. */
  vendorText: string | null;
  period: Period;
  /** Inclusive ISO dates, used only when `period` is "custom"; either end may be open. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Inclusive bounds on a single expense's amount, in USD. */
  minAmount: number | null;
  maxAmount: number | null;
  recurringOnly: boolean;
}

export interface AskQuery {
  /** "list" always returns individual expenses, so it implies groupBy "none". */
  metric: Metric;
  groupBy: GroupBy;
  filters: AskFilters;
  sort: SortOrder;
  /** 1 to MAX_LIMIT rows. */
  limit: number;
}

/** Inclusive ISO date range; a null end is open. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

/** First and last expense date in the user's data. */
export interface DataSpan {
  from: string;
  to: string;
}

export interface AskRow {
  /** Category name, vendorKey, "YYYY-MM", transaction id, or "all". */
  key: string;
  label: string;
  /** The metric's value for this row, rounded to cents (a count for "count"). */
  value: number;
  count: number;
  total: number;
  /** Sort anchor: the expense date, month start, or the group's latest charge. */
  date: string | null;
  /** The expense behind the value, for "list" and "max" rows. */
  transactionId: string | null;
}

export interface AskSummary {
  count: number;
  total: number;
  average: number;
  /** The single largest matching expense. */
  largest: Txn | null;
}

/** How "recurring" was decided for `recurringOnly`. */
export type RecurringSource = "leak_report" | "repeat_months";

export interface AskResult {
  query: AskQuery;
  /** The period resolved to dates; null for all time. */
  range: DateRange | null;
  /** First and last expense date across all of the user's data. */
  dataSpan: DataSpan | null;
  /** Sorted and limited rows. */
  rows: AskRow[];
  /** Row count before the limit was applied. */
  totalRows: number;
  /** Over every matching expense, independent of grouping and limit. */
  overall: AskSummary;
  /** Every matching expense, newest first. */
  transactions: Txn[];
  recurringSource: RecurringSource | null;
}

export type DeclineReason =
  | "advice"
  | "other_people"
  | "unrelated"
  | "unclear"
  | "no_data";

export interface AskAnswer {
  text: string;
  /** "template" today; "model" once phrasing passes the faithfulness check. */
  source: "template" | "model";
}

export interface PresetQuestion {
  id: string;
  question: string;
  query: AskQuery;
}
