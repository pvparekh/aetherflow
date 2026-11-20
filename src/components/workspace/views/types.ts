import type { LeakReport, Txn } from "@/lib/expense-intel/contracts";

/**
 * What every workspace view receives.
 *
 * Demo: `txns` is the 12-month synthetic year and every figure is computed in
 * the browser (no model, no network). Signed in: `txns` is null and views that
 * need more than the report call their API route.
 */
export interface ViewProps {
  demo: boolean;
  /** Leak report for all of the user's history (or the demo year). */
  report: LeakReport;
  /** Demo only: every transaction, for in-browser computation. */
  txns: Txn[] | null;
  /** ISO date treated as "today" (DEMO_TODAY in the demo). */
  today: string;
  /** Switch the workspace to another view, e.g. "subscriptions". */
  navigate?: (view: string) => void;
}
