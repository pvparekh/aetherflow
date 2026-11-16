// Server persistence for merchant rules and category history.
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayVendor, vendorKey } from "../normalize";
import { CATEGORIES, type Category } from "../types";
import {
  historyVotes,
  type CategoryEvidence,
  type KnownCategories,
  type MerchantRule,
} from "./index";

export type RuleOrigin = "correction" | "manual";

function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}

export async function loadMerchantRules(
  db: SupabaseClient,
  userId: string,
): Promise<MerchantRule[]> {
  const { data, error } = await db
    .from("merchant_rules")
    .select("vendor_key,category")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((row: { category: unknown }) => isCategory(row.category))
    .map((row: { vendor_key: string; category: Category }) => ({
      vendorKey: row.vendor_key,
      category: row.category,
    }));
}

/** Creates the rule for a vendor key, or replaces its category. */
export async function upsertMerchantRule(
  db: SupabaseClient,
  userId: string,
  rule: MerchantRule & { displayName: string | null; origin: RuleOrigin },
): Promise<void> {
  const { error } = await db.rpc("upsert_merchant_rule", {
    p_owner: userId,
    p_vendor_key: rule.vendorKey,
    p_category: rule.category,
    p_display_name: rule.displayName,
    p_origin: rule.origin,
  });
  if (error) throw error;
}

/** A category correction teaches a rule, so the vendor is never asked about again. */
export async function learnFromCorrection(
  db: SupabaseClient,
  userId: string,
  rawVendor: string,
  category: Category,
): Promise<void> {
  const key = vendorKey(rawVendor);
  if (!key) return;
  await upsertMerchantRule(db, userId, {
    vendorKey: key,
    category,
    displayName: displayVendor(rawVendor),
    origin: "correction",
  });
}

/**
 * Categorised rows across the user's completed uploads. Fallback rows
 * ("Misc, needs review") are excluded: they record that nobody knew.
 * One query per upload keeps each response under Supabase's row cap
 * (see txns.ts).
 */
export async function loadCategoryEvidence(
  db: SupabaseClient,
  userId: string,
): Promise<CategoryEvidence[]> {
  const { data: uploads, error } = await db
    .from("uploads")
    .select("id")
    .eq("user_id", userId)
    .eq("pass1_status", "complete");
  if (error) throw error;
  const pages = await Promise.all(
    (uploads ?? []).map(async ({ id }: { id: string }) => {
      const { data, error: itemsError } = await db
        .from("line_items")
        .select("vendor,category")
        .eq("upload_id", id)
        .neq("category_origin", "fallback");
      if (itemsError) throw itemsError;
      return (data ?? []) as { vendor: string | null; category: unknown }[];
    }),
  );
  return pages
    .flat()
    .filter((row) => row.vendor && isCategory(row.category))
    .map((row) => ({
      vendorKey: vendorKey(row.vendor as string),
      category: row.category as Category,
    }));
}

export async function loadKnownCategories(
  db: SupabaseClient,
  userId: string,
): Promise<KnownCategories> {
  const [rules, evidence] = await Promise.all([
    loadMerchantRules(db, userId),
    loadCategoryEvidence(db, userId),
  ]);
  return { rules, votes: historyVotes(evidence) };
}
