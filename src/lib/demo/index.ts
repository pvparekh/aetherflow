// Public demo dataset: 12 months of synthetic card activity for one persona,
// generated deterministically from a fixed seed. Isomorphic: the /demo page
// runs this in the browser with no backend and no model.
//
// demoLineItems() looks like what the import pipeline stores (raw descriptor
// in `raw_text` and `vendor`, category already assigned); demoTxns() is the
// same data through `toTxn`, the input every analysis module takes.
import { toTxn, type Txn } from "@/lib/expense-intel/contracts";
import type { LineItem } from "@/lib/expense-intel/types";
import { generateDemoRows, type DemoRow } from "./generate";

export {
  DEMO_PERIOD,
  DEMO_PERSONA,
  DEMO_PLANTED,
  DEMO_SEED,
  DEMO_SUBSCRIPTIONS,
  DEMO_TODAY,
} from "./planted";
export type {
  DemoPlanted,
  DemoSubscription,
  PlantedDuplicate,
  PlantedNegative,
  PlantedPriceChange,
  PlantedUnusual,
} from "./planted";
export type { DemoRow } from "./generate";

let cached: readonly DemoRow[] | null = null;

/** The generated rows with their planted-story tags (for tests and the eval checks). */
export function demoRows(): DemoRow[] {
  cached ??= generateDemoRows();
  return cached.map((row) => ({ ...row }));
}

/** One demo statement upload per calendar month. */
export function demoUploadId(date: string): string {
  return `demo-upload-${date.slice(0, 7)}`;
}

export function demoLineItems(): LineItem[] {
  return demoRows().map((row) => ({
    id: row.id,
    upload_id: demoUploadId(row.date),
    raw_text: `${row.date},${row.descriptor},${row.amount.toFixed(2)}`,
    vendor: row.descriptor,
    amount: row.amount,
    transaction_date: row.date,
    category: row.category,
    subcategory: row.subcategory,
    confidence: 1,
    z_score: null,
    is_anomaly: false,
    anomaly_severity: "none",
    is_first_time_vendor: false,
    is_round_number: false,
    is_possible_duplicate: false,
    user_resolution: null,
  }));
}

export function demoTxns(): Txn[] {
  return demoLineItems()
    .map((item) => toTxn(item))
    .filter((txn): txn is Txn => txn !== null);
}
