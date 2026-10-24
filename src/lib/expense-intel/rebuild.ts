import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAndWriteStats } from "./stats";
import { runVendorIntelligence } from "./vendors";
// Caller holds the account write lease. Retries derive aggregates from saved records.
export async function rebuildUpload(
  db: SupabaseClient,
  owner: string,
  id: string,
) {
  const stats = await computeAndWriteStats(id, owner, db);
  await runVendorIntelligence(id, owner, db, stats);
  const { error } = await db
    .from("uploads")
    .update({ pass1_status: "complete" })
    .eq("id", id)
    .eq("user_id", owner);
  if (error) throw error;
}
