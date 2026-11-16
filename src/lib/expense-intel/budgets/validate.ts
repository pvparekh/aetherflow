// Input validation for budgets and transaction annotations. Pure and
// isomorphic, so the UI can check input with the same rules the routes apply.
import { CATEGORIES, type Category } from "../types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;
export const MAX_NOTE_LENGTH = 500;
/** Upper bound on a monthly target, to keep typos like 1e12 out of the data. */
export const MAX_MONTHLY_TARGET = 10_000_000;

const TAG_PATTERN = /^[\p{L}\p{N} -]+$/u;

function ok<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

function fail<T>(error: string): Parsed<T> {
  return { ok: false, error };
}

export function isCategory(value: unknown): value is Category {
  return (CATEGORIES as readonly unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface BudgetInput {
  category: Category;
  monthly_target: number;
}

/** Validates a `{ category, monthly_target }` body; the target is rounded to cents. */
export function parseBudgetInput(body: unknown): Parsed<BudgetInput> {
  const { category, monthly_target } = asRecord(body);
  if (!isCategory(category)) return fail("Choose a valid category");
  if (typeof monthly_target !== "number" || !Number.isFinite(monthly_target))
    return fail("Monthly target must be a number");
  const target = Math.round(monthly_target * 100) / 100;
  if (target <= 0) return fail("Monthly target must be more than zero");
  if (target > MAX_MONTHLY_TARGET)
    return fail(`Monthly target must be at most ${MAX_MONTHLY_TARGET.toLocaleString("en-US")}`);
  return ok({ category, monthly_target: target });
}

// ---------------------------------------------------------------------------
// Tags and notes
// ---------------------------------------------------------------------------

/**
 * Normalises tags: trims, collapses inner whitespace, lowercases and removes
 * duplicates (keeping first-seen order). Rejects empty tags, tags over
 * MAX_TAG_LENGTH characters, characters other than letters, digits, spaces
 * and hyphens, and more than MAX_TAGS distinct tags.
 */
export function parseTags(input: unknown): Parsed<string[]> {
  if (!Array.isArray(input)) return fail("Tags must be a list");
  const tags: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return fail("Each tag must be text");
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (!tag) return fail("Tags cannot be empty");
    if ([...tag].length > MAX_TAG_LENGTH)
      return fail(`Tags can be at most ${MAX_TAG_LENGTH} characters`);
    if (!TAG_PATTERN.test(tag))
      return fail("Tags can contain only letters, numbers, spaces and hyphens");
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return fail(`Use at most ${MAX_TAGS} tags`);
  return ok(tags);
}

/** Trims a note; an empty note or null clears it. */
export function parseNote(input: unknown): Parsed<string | null> {
  if (input === null) return ok(null);
  if (typeof input !== "string") return fail("Note must be text");
  const note = input.trim();
  if ([...note].length > MAX_NOTE_LENGTH)
    return fail(`Notes can be at most ${MAX_NOTE_LENGTH} characters`);
  return ok(note || null);
}

export interface AnnotationPatch {
  tags?: string[];
  note?: string | null;
}

/** Validates a `{ tags?, note? }` body. At least one field must be present. */
export function parseAnnotationPatch(body: unknown): Parsed<AnnotationPatch> {
  const record = asRecord(body);
  const hasTags = "tags" in record;
  const hasNote = "note" in record;
  if (!hasTags && !hasNote) return fail("Send tags or a note to update");

  const patch: AnnotationPatch = {};
  if (hasTags) {
    const tags = parseTags(record.tags);
    if (!tags.ok) return tags;
    patch.tags = tags.value;
  }
  if (hasNote) {
    const note = parseNote(record.note);
    if (!note.ok) return note;
    patch.note = note.value;
  }
  return ok(patch);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
