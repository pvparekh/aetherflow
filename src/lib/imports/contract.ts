export type AmountMode = "expenses" | "negative-outflow" | "positive-outflow";
export interface ImportOptions {
  amountMode: AmountMode;
  dateOrder: "mdy" | "dmy";
  currency: "USD";
  columns?: { vendor: string; amount: string; date: string };
}
export interface Candidate {
  id: string;
  vendor: string;
  amount: number;
  date: string | null;
  kind: "expense" | "credit" | "unknown";
  included: boolean;
  source: string;
  page: number | null;
  currency?: string | null;
  warnings: string[];
}
export interface Review {
  version: 1;
  filename: string;
  currency: "USD";
  rows: Candidate[];
  warnings: string[];
  pages: number | null;
  method: string;
  completeness: "review-required";
  options: ImportOptions;
}
export interface ImportDraft {
  id: string;
  status: "review" | "processing" | "complete" | "error";
  review: Review;
  upload_id: string | null;
  error: string | null;
  updated_at: string;
}
export const MAX_ROWS = 500;
export const MAX_BYTES = 4 * 1024 * 1024;
export const DEFAULT_OPTIONS: ImportOptions = {
  amountMode: "expenses",
  dateOrder: "mdy",
  currency: "USD",
};
export function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}
export function reviewTotal(rows: Candidate[]): number {
  return (
    rows.filter((r) => r.included).reduce((s, r) => s + cents(r.amount), 0) /
    100
  );
}
export function parseMoney(raw: string): number | null {
  let s = raw.trim();
  if (/^\(.+\)$/.test(s)) s = "-" + s.slice(1, -1);
  s = s.replace(/^([+-]?)\$\s*/, "$1");
  if (s.includes(",")) {
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return null;
    s = s.replace(/,/g, "");
  }
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : null;
}
export function parseDate(raw: string, order: "mdy" | "dmy"): string | null {
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  const local = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(raw.trim());
  if (iso) [, year, month, day] = iso.map(Number);
  else if (local) {
    year = Number(local[3]);
    month = Number(local[order === "mdy" ? 1 : 2]);
    day = Number(local[order === "mdy" ? 2 : 1]);
  } else return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 &&
    year <= 2100 &&
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
    ? d.toISOString().slice(0, 10)
    : null;
}
export function validateReview(value: unknown): Review {
  if (!value || typeof value !== "object") throw new Error("Invalid review");
  const r = value as Review;
  if (
    r.version !== 1 ||
    r.currency !== "USD" ||
    !Array.isArray(r.rows) ||
    r.rows.length > MAX_ROWS ||
    !Array.isArray(r.warnings)
  )
    throw new Error("Invalid review format");
  const ids = new Set<string>();
  for (const row of r.rows) {
    if (
      !row ||
      typeof row.id !== "string" ||
      ids.has(row.id) ||
      typeof row.vendor !== "string" ||
      row.vendor.length > 300 ||
      typeof row.included !== "boolean" ||
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      row.amount > 1e9 ||
      Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.0001 ||
      !["expense", "credit", "unknown"].includes(row.kind) ||
      typeof row.source !== "string" ||
      row.source.length > 4000 ||
      !Array.isArray(row.warnings)
    )
      throw new Error("Invalid transaction fields");
    ids.add(row.id);
    if (
      row.date !== null &&
      (typeof row.date !== "string" || parseDate(row.date, "mdy") !== row.date)
    )
      throw new Error("Use an ISO date or leave it empty");
    if (
      row.included &&
      (!row.vendor.trim() ||
        row.amount <= 0 ||
        row.kind !== "expense" ||
        (!!row.currency && row.currency !== "USD"))
    )
      throw new Error("Included rows must be confirmed positive expenses");
  }
  return r;
}
