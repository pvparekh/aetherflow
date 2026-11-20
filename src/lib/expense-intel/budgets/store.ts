// Server-side persistence for budgets and transaction annotations.
// Every function takes the owner's id and scopes its query to it: the routes
// use the service client, so row-level security is not the safeguard here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnotationPatch, BudgetInput } from "./validate";
import type { BudgetTarget } from "./progress";

/** A row of `public.budgets` (see supabase/migrations/20261116_leak_finder.sql). */
export interface BudgetRow extends BudgetTarget {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface LineItemAnnotations {
  id: string;
  tags: string[];
  note: string | null;
}

const BUDGET_COLUMNS = "id,category,monthly_target,created_at,updated_at";
const ANNOTATION_COLUMNS = "id,tags,note";

export async function listBudgets(
  db: SupabaseClient,
  userId: string,
): Promise<BudgetRow[]> {
  const { data, error } = await db
    .from("budgets")
    .select(BUDGET_COLUMNS)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(toBudgetRow);
}

/** Creates the category's budget or replaces its target. */
export async function upsertBudget(
  db: SupabaseClient,
  userId: string,
  input: BudgetInput,
): Promise<BudgetRow> {
  const { data, error } = await db
    .from("budgets")
    .upsert(
      {
        user_id: userId,
        category: input.category,
        monthly_target: input.monthly_target,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,category" },
    )
    .select(BUDGET_COLUMNS)
    .single();
  if (error) throw error;
  return toBudgetRow(data);
}

/** Deletes the category's budget. False when the user had none. */
export async function deleteBudget(
  db: SupabaseClient,
  userId: string,
  category: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("budgets")
    .delete()
    .eq("user_id", userId)
    .eq("category", category)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Finds a line item the user owns. Ownership lives on the upload, so the item
 * is read first and its upload is then matched against the user.
 */
export async function findOwnedLineItem(
  db: SupabaseClient,
  userId: string,
  lineItemId: string,
): Promise<{ id: string; upload_id: string } | null> {
  const { data: item, error } = await db
    .from("line_items")
    .select("id,upload_id")
    .eq("id", lineItemId)
    .maybeSingle();
  if (error) throw error;
  if (!item?.upload_id) return null;

  const { data: upload, error: uploadError } = await db
    .from("uploads")
    .select("id")
    .eq("id", item.upload_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (uploadError) throw uploadError;
  return upload ? { id: item.id, upload_id: item.upload_id } : null;
}

/**
 * Writes tags and/or note to an owned line item. Filtering on the upload too
 * means a row moved or deleted since the ownership check is not touched.
 * Returns null when the row is gone.
 */
export async function updateAnnotations(
  db: SupabaseClient,
  item: { id: string; upload_id: string },
  patch: AnnotationPatch,
): Promise<LineItemAnnotations | null> {
  const { data, error } = await db
    .from("line_items")
    .update(patch)
    .eq("id", item.id)
    .eq("upload_id", item.upload_id)
    .select(ANNOTATION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, tags: data.tags ?? [], note: data.note ?? null };
}

function toBudgetRow(row: Record<string, unknown>): BudgetRow {
  return {
    id: String(row.id),
    category: String(row.category),
    // Postgres numeric arrives as a string.
    monthly_target: Number(row.monthly_target),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
