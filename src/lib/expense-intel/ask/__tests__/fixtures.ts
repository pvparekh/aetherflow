import type { LeakReport, Txn } from "../../contracts";
import type { AskFilters, AskQuery } from "../types";

function txn(id: string, date: string, vendor: string, amount: number, category: string): Txn {
  return {
    id,
    date,
    vendor,
    vendorKey: vendor.toLowerCase().replace(/\s+/g, ""),
    amount,
    category,
    uploadId: "u1",
    tags: [],
    note: null,
  };
}

/** Nine expenses, June to October 2026. Total $704.24. */
export const TXNS: Txn[] = [
  txn("t1", "2026-08-03", "Figma", 15, "Software/SaaS"),
  txn("t2", "2026-09-03", "Figma", 15, "Software/SaaS"),
  txn("t3", "2026-10-03", "Figma", 20, "Software/SaaS"),
  txn("t4", "2026-10-05", "Whole Foods", 82.4, "Food/Dining"),
  txn("t5", "2026-10-20", "Whole Foods", 41.1, "Food/Dining"),
  txn("t6", "2026-09-14", "Delta", 420, "Travel/Transport"),
  txn("t7", "2026-07-02", "Uber", 18.5, "Travel/Transport"),
  txn("t8", "2026-10-28", "Uber Eats", 27.25, "Food/Dining"),
  txn("t9", "2026-06-10", "Staples", 64.99, "Office/Supplies"),
];

export const TODAY = "2026-11-15";

export const NO_FILTERS: AskFilters = {
  categories: [],
  vendorText: null,
  period: "all_time",
  dateFrom: null,
  dateTo: null,
  minAmount: null,
  maxAmount: null,
  recurringOnly: false,
};

export function query(overrides: Partial<Omit<AskQuery, "filters">> & { filters?: Partial<AskFilters> } = {}): AskQuery {
  return {
    metric: "sum",
    groupBy: "none",
    sort: "value_desc",
    limit: 50,
    ...overrides,
    filters: { ...NO_FILTERS, ...overrides.filters },
  };
}

/** A leak report whose only subscription is the given transactions. */
export function reportWith(transactionIds: string[]): LeakReport {
  return {
    generatedAt: "2026-11-15T00:00:00Z",
    periodStart: "2026-06-10",
    periodEnd: "2026-10-28",
    monthsCovered: 5,
    transactionCount: TXNS.length,
    subscriptions: [
      {
        key: "stream",
        vendor: "Stream",
        vendorKey: "stream",
        category: "Misc",
        cadence: "monthly",
        typicalAmount: 1,
        lastAmount: 1,
        lastDate: "2026-10-01",
        nextExpectedDate: "2026-11-01",
        annualCost: 12,
        occurrences: transactionIds.length,
        confidence: "high",
        status: "active",
        transactionIds,
      },
    ],
    priceChanges: [],
    duplicates: [],
    unusual: [],
    totals: {
      subscriptionsMonthly: 1,
      subscriptionsAnnual: 12,
      priceIncreasesAnnual: 0,
      duplicatesTotal: 0,
      foundAnnual: 0,
    },
    coverageNote: null,
  };
}
