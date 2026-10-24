import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { importAccess } from "@/lib/imports/access";
import { validateAnalysis } from "@/lib/expense-intel/ai/validate";
import { runPass2 } from "@/lib/expense-intel/ai/pass2";
export const maxDuration = 60;
export async function POST(req: Request) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  let id: string;
  try {
    id = (await req.json()).upload_id;
    if (typeof id !== "string") throw new Error();
  } catch {
    return NextResponse.json(
      { error: "An upload ID is required" },
      { status: 400 },
    );
  }
  const { data: u, error } = await a.db
    .from("uploads")
    .select(
      "id,pass1_status,pass2_status,analysis_started_at,analysis_run_id,ai_analysis",
    )
    .eq("id", id)
    .eq("user_id", a.user.id)
    .single();
  if (error || !u)
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  if (u.pass1_status !== "complete")
    return NextResponse.json(
      { error: "Finish the import first" },
      { status: 409 },
    );
  if (u.pass2_status === "complete") {
    try {
      return NextResponse.json(
        validateAnalysis({ ...u.ai_analysis, anomaly_explanations: [] }),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      /* Retry older invalid model output rather than returning a false success. */
    }
  }
  if (
    u.pass2_status === "processing" &&
    Date.now() - Date.parse(u.analysis_started_at ?? "") < 90000
  )
    return NextResponse.json(
      { error: "Analysis is already running. Retry in a moment." },
      { status: 409 },
    );
  const run = randomUUID();
  let claim = a.db
    .from("uploads")
    .update({
      pass2_status: "processing",
      analysis_run_id: run,
      analysis_started_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", a.user.id)
    .eq("pass2_status", u.pass2_status);
  claim = u.analysis_run_id
    ? claim.eq("analysis_run_id", u.analysis_run_id)
    : claim.is("analysis_run_id", null);
  const { data: claimed, error: claimError } = await claim
    .select("id")
    .maybeSingle();
  if (claimError)
    return NextResponse.json(
      { error: "Analysis service unavailable. Confirm database migration." },
      { status: 503 },
    );
  if (!claimed)
    return NextResponse.json(
      { error: "Another request started analysis" },
      { status: 409 },
    );
  try {
    return NextResponse.json(await runPass2(id, a.user.id, a.db, run), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    await a.db
      .from("uploads")
      .update({ pass2_status: "error", analysis_run_id: null })
      .eq("id", id)
      .eq("user_id", a.user.id)
      .eq("analysis_run_id", run);
    return NextResponse.json(
      {
        error:
          "Insights could not be generated. Your computed data is intact; retry later.",
      },
      { status: 503 },
    );
  }
}
