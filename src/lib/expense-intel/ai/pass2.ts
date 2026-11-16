// Server side of Pass 2: load the aggregates for one upload, write the
// narrative (model with faithfulness check, or template), and persist it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { GUIDE_VENDOR_NAMES } from "../actions/cancel-guide";
import { buildNarrativeContext, type NarrativeInputs } from "./narrative-context";
import { writeNarrative } from "./narrative";
import type { NarrativeResult } from "./validate";

const VENDOR_LIMIT = 20;

async function loadNarrativeInputs(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<NarrativeInputs> {
  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .select("id, uploaded_at, total_amount, line_item_count")
    .eq("id", uploadId)
    .eq("user_id", userId)
    .single();
  if (uploadError || !upload) throw new Error("Upload not found");

  const [items, stats, vendors, previous] = await Promise.all([
    supabase
      .from("line_items")
      .select("category, anomaly_severity, is_possible_duplicate, is_round_number, is_first_time_vendor")
      .eq("upload_id", uploadId),
    supabase
      .from("category_stats")
      .select("category, total_spend_period, pct_of_total_spend, rolling_avg_5, trend_direction")
      .eq("upload_id", uploadId),
    supabase
      .from("vendors")
      .select("vendor_name, primary_category, total_spend, total_occurrences")
      .eq("user_id", userId)
      .order("total_spend", { ascending: false })
      .limit(VENDOR_LIMIT),
    loadPreviousCategoryStats(supabase, userId, uploadId, upload.uploaded_at),
  ]);
  if (items.error || stats.error) throw new Error("Analysis inputs are unavailable");

  return {
    totalSpent: Number(upload.total_amount ?? 0),
    transactionCount: Number(upload.line_item_count ?? 0),
    items: items.data ?? [],
    categoryStats: stats.data ?? [],
    vendors: vendors.data ?? [],
    previousCategoryStats: previous,
  };
}

async function loadPreviousCategoryStats(
  supabase: SupabaseClient,
  userId: string,
  uploadId: string,
  uploadedAt: string,
): Promise<NarrativeInputs["previousCategoryStats"]> {
  const { data: prevUpload } = await supabase
    .from("uploads")
    .select("id")
    .eq("user_id", userId)
    .neq("id", uploadId)
    .eq("pass1_status", "complete")
    .lt("uploaded_at", uploadedAt)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prevUpload) return [];
  const { data } = await supabase
    .from("category_stats")
    .select("category, total_spend_period")
    .eq("upload_id", prevUpload.id);
  return data ?? [];
}

export async function runPass2(
  uploadId: string,
  userId: string,
  supabase: SupabaseClient,
  runId?: string,
): Promise<NarrativeResult> {
  const inputs = await loadNarrativeInputs(uploadId, userId, supabase);
  const context = buildNarrativeContext(inputs);
  // Any of the user's vendors, or a well-known subscription, that the text
  // names without it being in the context is treated as unfaithful.
  const knownNames = [...inputs.vendors.map((v) => v.vendor_name), ...GUIDE_VENDOR_NAMES];
  const result = await writeNarrative(context, { knownNames });

  let write = supabase
    .from("uploads")
    .update({
      pass2_status: "complete",
      health_score: result.health_score,
      ai_analysis: result,
    })
    .eq("id", uploadId)
    .eq("user_id", userId);
  if (runId) write = write.eq("analysis_run_id", runId);
  const { data: saved, error: writeError } = await write.select("id").maybeSingle();
  if (writeError || !saved) throw new Error("Analysis is stale or upload was deleted");

  return result;
}
