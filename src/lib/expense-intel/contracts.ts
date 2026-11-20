// Cross-workstream contracts. Isomorphic (no server imports).
//
// These types are the boundaries between the leak engine, the AI writing
// features, "Ask your spending", the evals and the UI. Change them only in a
// coordinated commit; extend by adding optional fields.
// Owners: see docs/leak-finder/02-workstreams.md.
import type { LineItem } from "./types";
import { displayVendor, vendorKey } from "./normalize";

/** One expense, normalised for analysis across all of a user's uploads. */
export interface Txn {
  id: string;
  /** ISO date YYYY-MM-DD. Rows without a date are excluded from time-based analysis. */
  date: string;
  vendor: string;
  vendorKey: string;
  /** Positive outflow amount in USD. */
  amount: number;
  category: string;
  uploadId: string | null;
  tags: string[];
  note: string | null;
}

export function toTxn(
  item: Pick<LineItem, "id" | "vendor" | "amount" | "transaction_date" | "category" | "upload_id"> & {
    tags?: string[] | null;
    note?: string | null;
  },
): Txn | null {
  const amount = Number(item.amount);
  if (!item.transaction_date || !Number.isFinite(amount) || amount <= 0) return null;
  const raw = item.vendor ?? "";
  return {
    id: item.id,
    date: item.transaction_date.slice(0, 10),
    vendor: displayVendor(raw),
    vendorKey: vendorKey(raw),
    amount: Math.round(amount * 100) / 100,
    category: item.category ?? "Misc",
    uploadId: item.upload_id ?? null,
    tags: item.tags ?? [],
    note: item.note ?? null,
  };
}

// ---------------------------------------------------------------------------
// Leak report (workstream B produces; UI, drafts and Ask consume)
// ---------------------------------------------------------------------------

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

export interface RecurringStream {
  /** vendorKey plus cadence, stable across reports. */
  key: string;
  vendor: string;
  vendorKey: string;
  category: string;
  cadence: Cadence;
  /** Median charge across the stream. */
  typicalAmount: number;
  lastAmount: number;
  lastDate: string;
  nextExpectedDate: string;
  /** typicalAmount (or lastAmount after a price change) annualised by cadence. */
  annualCost: number;
  occurrences: number;
  confidence: "high" | "medium";
  /** possibly_cancelled: the expected charge is overdue by more than one grace period. */
  status: "active" | "possibly_cancelled";
  transactionIds: string[];
}

export interface PriceChange {
  streamKey: string;
  vendor: string;
  previousAmount: number;
  newAmount: number;
  /** Date of the first charge at the new amount. */
  changedOn: string;
  /** Percentage change, positive for increases. */
  pct: number;
  /** (newAmount - previousAmount) annualised by the stream's cadence. */
  annualImpact: number;
}

export interface DuplicateCharge {
  vendor: string;
  vendorKey: string;
  amount: number;
  dates: string[];
  transactionIds: string[];
  /** amount × (count - 1). */
  extraCost: number;
}

export interface UnusualCharge {
  transactionId: string;
  vendor: string;
  category: string;
  date: string;
  amount: number;
  /** The typical amount it was compared against. */
  typicalAmount: number;
  /** "vendor" when scored against the vendor's own history, else "category". */
  baseline: "vendor" | "category";
  /** Plain-English reason, no statistics jargon. */
  reason: string;
  severity: "warning" | "critical";
}

export interface LeakTotals {
  subscriptionsMonthly: number;
  subscriptionsAnnual: number;
  priceIncreasesAnnual: number;
  duplicatesTotal: number;
  /** Headline "found $X a year": price increases annualised + duplicate cost. Never includes a guess. */
  foundAnnual: number;
}

export interface LeakReport {
  generatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  monthsCovered: number;
  transactionCount: number;
  subscriptions: RecurringStream[];
  priceChanges: PriceChange[];
  duplicates: DuplicateCharge[];
  unusual: UnusualCharge[];
  totals: LeakTotals;
  /** Shown when history is too short for reliable detection (for example under 3 months). */
  coverageNote: string | null;
}

// ---------------------------------------------------------------------------
// Drafts (workstream C produces; UI consumes)
// ---------------------------------------------------------------------------

export type DraftKind = "cancel" | "negotiate";

export interface DraftFact {
  label: string;
  value: string;
}

export interface Draft {
  kind: DraftKind;
  vendor: string;
  channel: "email" | "phone_script" | "web_form";
  subject: string | null;
  body: string;
  /** Official cancellation or account page, only when verified in the cancel guide. */
  cancelUrl: string | null;
  steps: string[];
  /** Every figure the draft relies on, taken from the user's data by code. */
  facts: DraftFact[];
  source: "model" | "template";
}

// ---------------------------------------------------------------------------
// Evaluation report (workstream E produces evals/results/latest.json; UI reads)
// ---------------------------------------------------------------------------

export interface CategoryScore {
  precision: number;
  recall: number;
  support: number;
}

export interface EvalRun {
  label: string;
  provider: string;
  model: string;
  runAt: string;
  categorisation: {
    accuracy: number;
    macroF1: number;
    schemaValidRate: number;
    abstainRate: number;
    /** Share of rows resolved by rules or cache without a model call. */
    resolvedWithoutModel: number;
    perCategory: Record<string, CategoryScore>;
  };
  narrative: {
    /** Share of generated summaries whose every number traces to the supplied data. */
    faithfulRate: number;
    samples: number;
  } | null;
  latencyMs: { p50: number; p95: number };
  /** Estimated cost per typical upload; 0 for local models. Null when unknown. */
  costPerUploadUsd: number | null;
}

export interface EvalReport {
  dataset: { name: string; rows: number; description: string };
  runs: EvalRun[];
}
