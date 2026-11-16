// JSON Schema and code validation for the model's output. Isomorphic.
//
// The schema constrains decoding where the provider supports strict mode;
// `parseTranslation` / `parseAskQuery` are the real gate and run on every
// output regardless. Anything they return is safe to execute.
import { CATEGORIES, type Category } from "../types";
import { isIsoDate } from "./dates";
import {
  GROUP_BYS,
  MAX_LIMIT,
  MAX_VENDOR_TEXT,
  METRICS,
  PERIODS,
  SORTS,
  type AskFilters,
  type AskQuery,
} from "./types";

/** Scope labels the translator must choose from before writing a query. */
export const SCOPES = ["spending_question", "advice", "other_people", "unrelated"] as const;
export type Scope = (typeof SCOPES)[number];

export interface Translation {
  scope: Scope;
  /** Present exactly when scope is "spending_question". */
  query: AskQuery | null;
}

const nullable = (type: string) => ({ type: [type, "null"] });

// Strict-mode rules (src/lib/llm/index.ts): every object closed, every
// property required, optional values expressed as nullable.
export const ASK_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["metric", "groupBy", "filters", "sort", "limit"],
  properties: {
    metric: { type: "string", enum: [...METRICS] },
    groupBy: { type: "string", enum: [...GROUP_BYS] },
    filters: {
      type: "object",
      additionalProperties: false,
      required: [
        "categories", "vendorText", "period", "dateFrom", "dateTo",
        "minAmount", "maxAmount", "recurringOnly",
      ],
      properties: {
        categories: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
        vendorText: nullable("string"),
        period: { type: "string", enum: [...PERIODS] },
        dateFrom: nullable("string"),
        dateTo: nullable("string"),
        minAmount: nullable("number"),
        maxAmount: nullable("number"),
        recurringOnly: { type: "boolean" },
      },
    },
    sort: { type: "string", enum: [...SORTS] },
    limit: { type: "integer" },
  },
} as const;

export const TRANSLATION_SCHEMA = {
  name: "ask_translation",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["scope", "query"],
    properties: {
      scope: { type: "string", enum: [...SCOPES] },
      query: { anyOf: [ASK_QUERY_SCHEMA, { type: "null" }] },
    },
  },
};

export class AskQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskQueryError";
  }
}

function fail(message: string): never {
  throw new AskQueryError(message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value))
    return value as T;
  fail(`${path} must be one of ${allowed.join(", ")}`);
}

function canonicalCategory(value: unknown): Category {
  const match = CATEGORIES.find(
    (c) => typeof value === "string" && c.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? fail(`unknown category ${JSON.stringify(value)}`);
}

function parseCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) fail("filters.categories must be an array");
  return [...new Set(value.map(canonicalCategory))];
}

/** Keep vendor search text to letters, digits and a few joining characters. */
function parseVendorText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail("filters.vendorText must be a string or null");
  const cleaned = value
    .replace(/[^\p{L}\p{N}&'.\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VENDOR_TEXT);
  return cleaned || null;
}

function parseDate(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !isIsoDate(value)) fail(`${path} must be a YYYY-MM-DD date`);
  return value;
}

function parseAmount(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    fail(`${path} must be a non-negative number`);
  return value;
}

function parseFilters(value: unknown): AskFilters {
  const f = record(value, "filters");
  const period = oneOf(f.period, PERIODS, "filters.period");
  const dateFrom = parseDate(f.dateFrom, "filters.dateFrom");
  const dateTo = parseDate(f.dateTo, "filters.dateTo");
  if (period === "custom" && !dateFrom && !dateTo)
    fail("a custom period needs dateFrom or dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) fail("dateFrom is after dateTo");
  const minAmount = parseAmount(f.minAmount, "filters.minAmount");
  const maxAmount = parseAmount(f.maxAmount, "filters.maxAmount");
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount)
    fail("minAmount is above maxAmount");
  if (typeof f.recurringOnly !== "boolean") fail("filters.recurringOnly must be a boolean");
  return {
    categories: parseCategories(f.categories),
    vendorText: parseVendorText(f.vendorText),
    period,
    // Explicit dates only mean something for a custom period.
    dateFrom: period === "custom" ? dateFrom : null,
    dateTo: period === "custom" ? dateTo : null,
    minAmount,
    maxAmount,
    recurringOnly: f.recurringOnly,
  };
}

function parseLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("limit must be a number");
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(value)));
}

/** Validate and normalise an untrusted query. Throws AskQueryError. */
export function parseAskQuery(value: unknown): AskQuery {
  const q = record(value, "query");
  const metric = oneOf(q.metric, METRICS, "metric");
  return {
    metric,
    // A list is always of individual expenses.
    groupBy: metric === "list" ? "none" : oneOf(q.groupBy, GROUP_BYS, "groupBy"),
    filters: parseFilters(q.filters),
    sort: oneOf(q.sort, SORTS, "sort"),
    limit: parseLimit(q.limit),
  };
}

/** Validate the translator's whole output. Throws AskQueryError. */
export function parseTranslation(value: unknown): Translation {
  const t = record(value, "output");
  const scope = oneOf(t.scope, SCOPES, "scope");
  if (scope !== "spending_question") return { scope, query: null };
  if (t.query === null || t.query === undefined) fail("a spending question needs a query");
  return { scope, query: parseAskQuery(t.query) };
}
