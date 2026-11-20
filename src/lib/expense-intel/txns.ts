// Server helper: every analysable transaction for one user, across all
// completed uploads. Shared by the leak engine, Ask and drafts routes.
//
// Each upload holds at most MAX_ROWS (500) rows, below Supabase's default
// 1,000-row response cap, so one query per upload is complete.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toTxn, type Txn } from "./contracts";
import type { LineItem } from "./types";

export async function loadUserTxns(
  db: SupabaseClient,
  userId: string,
): Promise<Txn[]> {
  const { data: uploads, error } = await db
    .from("uploads")
    .select("id")
    .eq("user_id", userId)
    .eq("pass1_status", "complete");
  if (error) throw error;
  const ids = (uploads ?? []).map((u: { id: string }) => u.id);
  const pages = await Promise.all(
    ids.map(async (id) => {
      // select("*") so tags and note are read when the leak-finder migration
      // is applied, and the query still works before it is.
      const { data, error: itemsError } = await db
        .from("line_items")
        .select("*")
        .eq("upload_id", id);
      if (itemsError) throw itemsError;
      return (data ?? []) as (LineItem & { tags?: string[] | null; note?: string | null })[];
    }),
  );
  return pages
    .flat()
    .map(toTxn)
    .filter((t): t is Txn => t !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
