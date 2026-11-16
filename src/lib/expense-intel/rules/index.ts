// Rules and history resolve a row before it reaches the model ("model
// last", docs/leak-finder/01-architecture.md). Isomorphic: no server imports.
//
// Order of authority: a merchant rule (the user said so) beats a history
// vote (the user's past rows agree), which beats the model.
import type { Category } from "../types";

/** A history vote needs this many categorised rows for the vendor... */
export const HISTORY_MIN_VOTES = 2;
/** ...and this share of them in one category. */
export const HISTORY_MIN_AGREEMENT = 0.75;

export interface MerchantRule {
  vendorKey: string;
  category: Category;
}

/** One already-categorised row from the user's history. */
export interface CategoryEvidence {
  vendorKey: string;
  category: Category;
}

/** What the user's rules and history already know, keyed by vendor key. */
export interface KnownCategories {
  rules: MerchantRule[];
  votes: Map<string, Category>;
}

export interface KeyedItem {
  id: string;
  vendorKey: string;
}

export interface KnownCategory {
  category: Category;
  origin: "rule" | "history";
}

export const NOTHING_KNOWN: KnownCategories = { rules: [], votes: new Map() };

/** Category per item id for items whose vendor key has a merchant rule. */
export function resolveFromRules(
  items: KeyedItem[],
  rules: MerchantRule[],
): Map<string, Category> {
  const byKey = new Map(rules.map((rule) => [rule.vendorKey, rule.category]));
  return matchByKey(items, byKey);
}

/** Category per item id for items whose vendor has a clear history vote. */
export function resolveFromHistory(
  items: KeyedItem[],
  votes: Map<string, Category>,
): Map<string, Category> {
  return matchByKey(items, votes);
}

/**
 * Majority category per vendor key, kept only when at least
 * HISTORY_MIN_VOTES rows exist and HISTORY_MIN_AGREEMENT of them agree.
 */
export function historyVotes(
  evidence: CategoryEvidence[],
): Map<string, Category> {
  const tallies = new Map<string, Map<Category, number>>();
  for (const { vendorKey, category } of evidence) {
    if (!vendorKey) continue;
    const tally = tallies.get(vendorKey) ?? new Map<Category, number>();
    tally.set(category, (tally.get(category) ?? 0) + 1);
    tallies.set(vendorKey, tally);
  }
  const votes = new Map<string, Category>();
  for (const [vendorKey, tally] of tallies) {
    const winner = clearMajority(tally);
    if (winner) votes.set(vendorKey, winner);
  }
  return votes;
}

/** Rules first, then history. Items absent from the result need the model. */
export function resolveKnown(
  items: KeyedItem[],
  known: KnownCategories,
): Map<string, KnownCategory> {
  const resolved = new Map<string, KnownCategory>();
  for (const [id, category] of resolveFromRules(items, known.rules))
    resolved.set(id, { category, origin: "rule" });
  const remaining = items.filter((item) => !resolved.has(item.id));
  for (const [id, category] of resolveFromHistory(remaining, known.votes))
    resolved.set(id, { category, origin: "history" });
  return resolved;
}

function matchByKey(
  items: KeyedItem[],
  categoryByKey: Map<string, Category>,
): Map<string, Category> {
  const matched = new Map<string, Category>();
  for (const item of items) {
    const category = item.vendorKey ? categoryByKey.get(item.vendorKey) : undefined;
    if (category) matched.set(item.id, category);
  }
  return matched;
}

function clearMajority(tally: Map<Category, number>): Category | null {
  let total = 0;
  let best: [Category, number] | null = null;
  for (const [category, count] of tally) {
    total += count;
    if (!best || count > best[1]) best = [category, count];
  }
  if (!best || total < HISTORY_MIN_VOTES) return null;
  return best[1] / total >= HISTORY_MIN_AGREEMENT ? best[0] : null;
}
