// Small builders for leak engine fixtures. Vendor keys go through the real
// normaliser so fixtures behave like imported rows.
import type { Txn } from "../../contracts";
import { displayVendor, isPersonToPerson, vendorKey } from "../../normalize";
import { addDays, addMonths } from "../dates";

let counter = 0;

export function txn(
  date: string,
  rawVendor: string,
  amount: number,
  category = "Software/SaaS",
  extra: Partial<Txn> = {},
): Txn {
  counter += 1;
  return {
    id: `t${String(counter).padStart(5, "0")}`,
    date,
    vendor: displayVendor(rawVendor),
    vendorKey: vendorKey(rawVendor),
    transfer: isPersonToPerson(rawVendor),
    amount,
    category,
    uploadId: "upload-1",
    tags: [],
    note: null,
    ...extra,
  };
}

/** One charge per month from `start`, keeping its day of the month. Amounts may vary per charge. */
export function monthly(
  rawVendor: string,
  amounts: number | number[],
  start: string,
  count: number,
  category?: string,
): Txn[] {
  const day = Number(start.slice(8, 10));
  return Array.from({ length: count }, (_, i) =>
    txn(addMonths(start, i, day), rawVendor, amountAt(amounts, i), category),
  );
}

export function everyNDays(
  rawVendor: string,
  amounts: number | number[],
  start: string,
  count: number,
  days: number,
  category?: string,
): Txn[] {
  return Array.from({ length: count }, (_, i) =>
    txn(addDays(start, i * days), rawVendor, amountAt(amounts, i), category),
  );
}

function amountAt(amounts: number | number[], i: number): number {
  return Array.isArray(amounts) ? amounts[i] : amounts;
}

/** Deterministic pseudo-random numbers in [0, 1) for "irregular" fixtures. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A filler transaction so the report's period spans [start, end]. */
export function periodMarkers(start: string, end: string): Txn[] {
  return [txn(start, "Corner Hardware", 12.5, "Office/Supplies"), txn(end, "Paper Source", 13.25, "Office/Supplies")];
}
