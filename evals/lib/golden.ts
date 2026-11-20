// Golden set for categorisation: loading, validation and labelling rules.
//
// evals/golden/categorize.jsonl holds one JSON object per line:
//
//   id          unique, "<category prefix>-NNN"
//   descriptor  raw bank descriptor, as printed on a statement
//   amount      positive USD, at most 2 decimals
//   category    expected category, one of CATEGORIES
//   vendor      expected display vendor (see below)
//   hard        optional, true for deliberately difficult rows
//   notes       optional, why the label was chosen when it is not obvious
//
// Labelling rules:
// - Category is the most common business-expense reading of the merchant.
//   Ambiguous merchants (Amazon, Costco, Apple, LinkedIn Premium, …) carry a
//   note explaining the choice.
// - Display vendor is the merchant's brand as people write it: no processor
//   prefix (SQ *, TST*), store number, city, state, phone, reference id or
//   legal suffix. Sub-brands are kept when the same company sells services in
//   different categories (Uber vs Uber Eats, Google Ads vs Google Workspace,
//   Apple vs Apple Store). Marketplaces of record keep their own name
//   (DoorDash, Amazon), not the seller's.
// - Vendors are compared loosely (case, spaces and punctuation ignored); see
//   `vendorMatches`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORIES, type Category } from "@/lib/expense-intel/types";

export interface GoldenRow {
  id: string;
  descriptor: string;
  amount: number;
  category: Category;
  vendor: string;
  hard?: boolean;
  notes?: string;
}

export const GOLDEN_PATH = path.join("evals", "golden", "categorize.jsonl");
export const GOLDEN_MIN_ROWS = 200;
export const GOLDEN_MIN_PER_CATEGORY = 15;

const ALLOWED_KEYS = new Set(["id", "descriptor", "amount", "category", "vendor", "hard", "notes"]);

export class GoldenSetError extends Error {
  constructor(readonly problems: string[]) {
    super(`Golden set is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "GoldenSetError";
  }
}

function checkRow(value: unknown, where: string): { row?: GoldenRow; problems: string[] } {
  const problems: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { problems: [`${where}: not a JSON object`] };
  }
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) if (!ALLOWED_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);

  const nonEmpty = (key: string) => {
    if (typeof v[key] !== "string" || !(v[key] as string).trim()) problems.push(`${where}: "${key}" must be a non-empty string`);
    else if ((v[key] as string).trim() !== v[key]) problems.push(`${where}: "${key}" has surrounding whitespace`);
  };
  nonEmpty("id");
  nonEmpty("descriptor");
  nonEmpty("vendor");

  const amount = v.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    problems.push(`${where}: "amount" must be a positive number`);
  } else if (Math.round(amount * 100) / 100 !== amount) {
    problems.push(`${where}: "amount" has more than 2 decimals`);
  }
  if (!CATEGORIES.includes(v.category as Category)) {
    problems.push(`${where}: "category" ${JSON.stringify(v.category)} is not one of ${CATEGORIES.join(", ")}`);
  }
  if (v.hard !== undefined && v.hard !== true) problems.push(`${where}: "hard" must be true when present`);
  if (v.notes !== undefined && (typeof v.notes !== "string" || !v.notes.trim())) {
    problems.push(`${where}: "notes" must be a non-empty string when present`);
  }
  return problems.length ? { problems } : { row: v as unknown as GoldenRow, problems };
}

/**
 * Parses and validates the JSONL text. Throws `GoldenSetError` listing every
 * problem (not just the first) so a labelling pass can be fixed in one go.
 */
export function parseGolden(text: string): GoldenRow[] {
  const rows: GoldenRow[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const where = `line ${i + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      problems.push(`${where}: not valid JSON`);
      return;
    }
    const checked = checkRow(value, where);
    problems.push(...checked.problems);
    if (checked.row) rows.push(checked.row);
  });

  const seen = (key: "id" | "descriptor") => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
    for (const [value, count] of counts) if (count > 1) problems.push(`duplicate ${key} "${value}" (${count} rows)`);
  };
  seen("id");
  seen("descriptor");

  if (problems.length) throw new GoldenSetError(problems);
  return rows;
}

/** Coverage problems: too few rows overall or for any category. */
export function coverageProblems(rows: readonly GoldenRow[]): string[] {
  const problems: string[] = [];
  if (rows.length < GOLDEN_MIN_ROWS) problems.push(`${rows.length} rows, need at least ${GOLDEN_MIN_ROWS}`);
  for (const category of CATEGORIES) {
    const n = rows.filter((r) => r.category === category).length;
    if (n < GOLDEN_MIN_PER_CATEGORY) problems.push(`${category}: ${n} rows, need at least ${GOLDEN_MIN_PER_CATEGORY}`);
  }
  return problems;
}

export function loadGolden(file: string = path.resolve(GOLDEN_PATH)): GoldenRow[] {
  return parseGolden(readFileSync(file, "utf8"));
}

/** Case-, space- and punctuation-insensitive comparison of display vendors. */
export function vendorMatches(actual: string, expected: string): boolean {
  const loose = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return loose(actual) === loose(expected);
}
