import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { importAccess, importFailure } from "@/lib/imports/access";
import { validateReview } from "@/lib/imports/contract";
import { categorizeBatch } from "@/lib/expense-intel/pass1/categorizer";
import { computeAndWriteStats } from "@/lib/expense-intel/stats";
import { runVendorIntelligence } from "@/lib/expense-intel/vendors";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
export const maxDuration = 120;
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  let run: string | undefined;
  try {
    const { data: d, error } = await a.db
      .from("import_drafts")
      .select("*")
      .eq("id", id)
      .eq("user_id", a.user.id)
      .single();
    if (error || !d)
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    if (d.status === "complete" && d.upload_id) {
      const { data: ready } = await a.db
        .from("uploads")
        .select("pass1_status")
        .eq("id", d.upload_id)
        .eq("user_id", a.user.id)
        .maybeSingle();
      if (ready?.pass1_status === "complete")
        return NextResponse.json(
          {
            upload_id: d.upload_id,
            complete: true,
            processed: d.cursor,
            total: d.cursor,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
    }
    const review = validateReview(d.review);
    const selected = review.rows.filter((r) => r.included);
    if (!selected.length)
      return NextResponse.json(
        { error: "Select at least one confirmed expense" },
        { status: 400 },
      );
    // Resume stale work after 90 seconds. Each model chunk is bounded below this lease.
    if (
      d.status === "processing" &&
      Date.now() - Date.parse(d.updated_at) < 90000
    )
      return NextResponse.json(
        { error: "This import is already processing. Retry shortly." },
        { status: 409 },
      );
    run = randomUUID();
    const { data: claim, error: claimError } = await a.db
      .from("import_drafts")
      .update({
        status: "processing",
        run_id: run,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", a.user.id)
      .eq("updated_at", d.updated_at)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim)
      return NextResponse.json(
        { error: "Another request is processing this import" },
        { status: 409 },
      );
    let uploadId: string | null = d.upload_id;
    if (!uploadId) {
      const batch = selected.slice(d.cursor, d.cursor + 25);
      const raw = batch.map((r) => ({
        raw_text: r.source,
        vendor: r.vendor,
        amount: r.amount,
        transaction_date: r.date,
      }));
      const categories = await categorizeBatch(raw);
      const chunk = raw.map((r, i) => ({
        ...r,
        category: categories[i].category,
        subcategory: categories[i].subcategory,
        confidence: categories[i].confidence,
      }));
      const { data, error: commitError } = await a.db.rpc(
        "append_import_chunk",
        {
          p_id: id,
          p_owner: a.user.id,
          p_run: run,
          p_cursor: d.cursor,
          p_chunk: chunk,
        },
      );
      if (commitError) throw commitError;
      uploadId = data;
    }
    if (uploadId) {
      await withExpenseLease(a.db, a.user.id, async () => {
        const { data: u } = await a.db
          .from("uploads")
          .select("pass1_status")
          .eq("id", uploadId)
          .eq("user_id", a.user.id)
          .single();
        if (u?.pass1_status !== "complete") {
          const stats = await computeAndWriteStats(uploadId, a.user.id, a.db);
          await runVendorIntelligence(uploadId, a.user.id, a.db, stats);
          const { error: finalError } = await a.db
            .from("uploads")
            .update({ pass1_status: "complete" })
            .eq("id", uploadId)
            .eq("user_id", a.user.id);
          if (finalError) throw finalError;
        }
        const { error: invalidate } = await a.db
          .from("uploads")
          .update({
            pass2_status: "pending",
            analysis_run_id: randomUUID(),
            health_score: null,
            ai_analysis: null,
          })
          .eq("user_id", a.user.id)
          .neq("id", uploadId);
        if (invalidate) throw invalidate;
        const { error: finishError } = await a.db
          .from("import_drafts")
          .update({
            status: "complete",
            run_id: null,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", a.user.id)
          .eq("run_id", run);
        if (finishError) throw finishError;
      });
    }
    return NextResponse.json(
      {
        upload_id: uploadId,
        complete: !!uploadId,
        processed: Math.min(selected.length, d.cursor + 25),
        total: selected.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (run)
      await a.db
        .from("import_drafts")
        .update({
          status: "error",
          run_id: null,
          error: "Import paused. Retry to resume saved progress.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", a.user.id)
        .eq("run_id", run);
    if (e instanceof BusyError)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return importFailure(e);
  }
}
