// The pre-aggregated context the narrative is written from (CLAUDE.md
// principle 2: aggregates only, never raw line items). Pure and isomorphic:
// the database reads live in pass2.ts.
//
// Every derived figure (percent changes, "running high") is computed here so
// the model never does arithmetic, and the same values feed the faithfulness
// check and the template fallback.
import { CATEGORIES } from "../types";
import type { FaithfulnessFacts } from "./faithfulness";

export interface CategoryLine {
  category: string;
  spent: number;
  /** Share of this period's total, one decimal place. */
  sharePct: number;
  /** Recent average per period; null without history. */
  recentAverage: number | null;
  /** Whole-percent change against the recent average, positive when higher. */
  vsRecentPct: number | null;
  lastPeriodSpent: number | null;
  vsLastPeriodPct: number | null;
  trend: string | null;
  flaggedCharges: number;
}

export interface VendorLine {
  vendor: string;
  totalSpend: number;
  occurrences: number;
}

export interface CrowdedCategory {
  category: string;
  vendorCount: number;
  vendors: string[];
}

export interface NarrativeContext {
  totalSpent: number;
  transactionCount: number;
  hasPreviousHistory: boolean;
  categories: CategoryLine[];
  /** Categories spending more than RUNNING_HIGH_RATIO times their recent average. */
  categoriesRunningHigh: string[];
  topVendors: VendorLine[];
  crowdedCategories: CrowdedCategory[];
  flags: {
    totalFlagged: number;
    possibleDuplicates: number;
    newVendorsFlagged: number;
    roundNumbers: number;
  };
}

export interface CategoryStatRow {
  category: string;
  total_spend_period: number | string | null;
  pct_of_total_spend: number | string | null;
  rolling_avg_5: number | string | null;
  trend_direction: string | null;
}

export interface VendorRow {
  vendor_name: string;
  primary_category: string | null;
  total_spend: number | string | null;
  total_occurrences: number | null;
}

export interface FlaggedItemRow {
  category: string | null;
  anomaly_severity: string | null;
  is_possible_duplicate: boolean | null;
  is_round_number: boolean | null;
  is_first_time_vendor: boolean | null;
}

export interface NarrativeInputs {
  totalSpent: number;
  transactionCount: number;
  categoryStats: CategoryStatRow[];
  previousCategoryStats: { category: string; total_spend_period: number | string | null }[];
  items: FlaggedItemRow[];
  vendors: VendorRow[];
}

export const RUNNING_HIGH_RATIO = 1.25;
const TOP_VENDOR_COUNT = 5;
const CROWDED_VENDOR_COUNT = 3;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function pctChange(current: number, reference: number | null): number | null {
  if (reference === null || reference <= 0) return null;
  return Math.round(((current - reference) / reference) * 100);
}

export function buildNarrativeContext(inputs: NarrativeInputs): NarrativeContext {
  const isFlagged = (i: FlaggedItemRow) => (i.anomaly_severity ?? "none") !== "none";
  const flagged = inputs.items.filter(isFlagged);

  const categories = [...inputs.categoryStats]
    .sort((a, b) => num(b.total_spend_period) - num(a.total_spend_period))
    .map((row): CategoryLine => {
      const spent = round2(num(row.total_spend_period));
      const rolling = num(row.rolling_avg_5);
      const recentAverage = rolling > 0 ? round2(rolling) : null;
      const previous = inputs.previousCategoryStats.find((p) => p.category === row.category);
      const lastPeriodSpent = previous ? round2(num(previous.total_spend_period)) : null;
      return {
        category: row.category,
        spent,
        sharePct: Math.round(num(row.pct_of_total_spend) * 10) / 10,
        recentAverage,
        vsRecentPct: pctChange(spent, recentAverage),
        lastPeriodSpent,
        vsLastPeriodPct: pctChange(spent, lastPeriodSpent),
        trend: row.trend_direction ?? null,
        flaggedCharges: flagged.filter((i) => i.category === row.category).length,
      };
    });

  return {
    totalSpent: round2(inputs.totalSpent),
    transactionCount: inputs.transactionCount,
    hasPreviousHistory: inputs.previousCategoryStats.length > 0,
    categories,
    categoriesRunningHigh: categories
      .filter((c) => c.recentAverage !== null && c.spent > c.recentAverage * RUNNING_HIGH_RATIO)
      .map((c) => c.category),
    topVendors: inputs.vendors.slice(0, TOP_VENDOR_COUNT).map((v) => ({
      vendor: v.vendor_name,
      totalSpend: round2(num(v.total_spend)),
      occurrences: num(v.total_occurrences),
    })),
    crowdedCategories: crowdedCategories(inputs.vendors),
    flags: {
      totalFlagged: flagged.length,
      possibleDuplicates: inputs.items.filter((i) => i.is_possible_duplicate).length,
      newVendorsFlagged: flagged.filter((i) => i.is_first_time_vendor).length,
      roundNumbers: flagged.filter((i) => i.is_round_number).length,
    },
  };
}

function crowdedCategories(vendors: VendorRow[]): CrowdedCategory[] {
  const byCategory = new Map<string, string[]>();
  for (const v of vendors) {
    const category = v.primary_category ?? "Misc";
    byCategory.set(category, [...(byCategory.get(category) ?? []), v.vendor_name]);
  }
  return [...byCategory.entries()]
    .filter(([, names]) => names.length >= CROWDED_VENDOR_COUNT)
    .map(([category, names]) => ({ category, vendorCount: names.length, vendors: names.slice(0, 5) }));
}

/** Everything the narrative may state, for `checkFaithfulness`. */
export function narrativeFacts(ctx: NarrativeContext, otherKnownNames: string[] = []): FaithfulnessFacts {
  const vendorNames = [
    ...ctx.topVendors.map((v) => v.vendor),
    ...ctx.crowdedCategories.flatMap((c) => c.vendors),
  ];
  const categoryNames = [
    ...ctx.categories.map((c) => c.category),
    ...ctx.crowdedCategories.map((c) => c.category),
  ];
  const present = <T>(values: (T | null)[]) => values.filter((v): v is T => v !== null);

  return {
    amounts: [
      ctx.totalSpent,
      ...ctx.categories.flatMap((c) => present([c.spent, c.recentAverage, c.lastPeriodSpent])),
      ...ctx.topVendors.map((v) => v.totalSpend),
    ],
    percents: ctx.categories.flatMap((c) => present([c.sharePct, c.vsRecentPct, c.vsLastPeriodPct])),
    counts: [
      ctx.transactionCount,
      ctx.categories.length,
      ctx.categoriesRunningHigh.length,
      ctx.topVendors.length,
      ...ctx.categories.map((c) => c.flaggedCharges),
      ...ctx.topVendors.map((v) => v.occurrences),
      ...ctx.crowdedCategories.map((c) => c.vendorCount),
      ...Object.values(ctx.flags),
    ],
    names: [...vendorNames, ...categoryNames],
    knownNames: [...CATEGORIES, ...otherKnownNames],
  };
}
