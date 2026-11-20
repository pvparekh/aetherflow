import { NextResponse } from "next/server";
import { importAccess, importFailure } from "@/lib/imports/access";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
import { computeAndWriteStats } from "@/lib/expense-intel/stats";
export const maxDuration = 120;
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { uploadId } = await params;
  try {
    return await withExpenseLease(a.db, a.user.id, async () => {
      const { error } = await a.db.rpc("delete_expense_report", {
        p_owner: a.user.id,
        p_upload: uploadId,
      });
      if (error) throw error;
      // Repeating a deletion also repairs historical metrics after an interrupted response.
      const { data: latest, error: readError } = await a.db
        .from("uploads")
        .select("id")
        .eq("user_id", a.user.id)
        .eq("pass1_status", "complete")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readError) throw readError;
      if (latest) await computeAndWriteStats(latest.id, a.user.id, a.db);
      return NextResponse.json(
        { deleted: uploadId },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (e) {
    if (e instanceof BusyError)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return importFailure(e);
  }
}
