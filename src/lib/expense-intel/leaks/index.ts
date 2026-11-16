// STUB: replaced by workstream B on merge.
// Exists only so workstream C's drafts route compiles and tests in isolation.
import type { LeakReport, Txn } from "../contracts";

export function buildLeakReport(txns: Txn[], today: string): LeakReport {
  return {
    generatedAt: today,
    periodStart: null,
    periodEnd: null,
    monthsCovered: 0,
    transactionCount: txns.length,
    subscriptions: [],
    priceChanges: [],
    duplicates: [],
    unusual: [],
    totals: {
      subscriptionsMonthly: 0,
      subscriptionsAnnual: 0,
      priceIncreasesAnnual: 0,
      duplicatesTotal: 0,
      foundAnnual: 0,
    },
    coverageNote: null,
  };
}
