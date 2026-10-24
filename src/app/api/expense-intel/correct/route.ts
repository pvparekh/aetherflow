import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { importAccess, importFailure } from "@/lib/imports/access";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
import { CATEGORIES } from "@/lib/expense-intel/types";
import { rebuildUpload } from "@/lib/expense-intel/rebuild";
export const maxDuration = 120;
export async function PATCH(req: Request) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  try {
    const { line_item_id, category } = await req.json();
    if (typeof line_item_id !== "string" || !CATEGORIES.includes(category))
      return NextResponse.json(
        { error: "Choose a valid category" },
        { status: 400 },
      );
    return await withExpenseLease(a.db, a.user.id, async () => {
      const { data: owned } = await a.db
        .from("line_items")
        .select("upload_id,uploads!inner(user_id)")
        .eq("id", line_item_id)
        .eq("uploads.user_id", a.user.id)
        .maybeSingle();
      if (!owned)
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 },
        );
      const { data: id, error } = await a.db.rpc("correct_expense_category", {
        p_owner: a.user.id,
        p_item: line_item_id,
        p_category: category,
      });
      if (error) throw error;
      await rebuildUpload(a.db, a.user.id, id);
      const { data: latest } = await a.db
        .from("uploads")
        .select("id")
        .eq("user_id", a.user.id)
        .eq("pass1_status", "complete")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest && latest.id !== id)
        await rebuildUpload(a.db, a.user.id, latest.id);
      // Invalidate every saved narrative because historical aggregates have changed.
      const { error: invalidate } = await a.db
        .from("uploads")
        .update({
          pass2_status: "pending",
          analysis_run_id: randomUUID(),
          health_score: null,
          ai_analysis: null,
        })
        .eq("user_id", a.user.id);
      if (invalidate) throw invalidate;
      return NextResponse.json(
        { updated: true, upload_id: id },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (e) {
    if (e instanceof BusyError)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return importFailure(e);
  }
}
