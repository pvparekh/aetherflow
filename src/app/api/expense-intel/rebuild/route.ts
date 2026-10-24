import { NextResponse } from "next/server";
import { importAccess, importFailure } from "@/lib/imports/access";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
import { rebuildUpload } from "@/lib/expense-intel/rebuild";
export const maxDuration = 120;
export async function POST(req: Request) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  try {
    const { upload_id } = await req.json();
    const { data: u } = await a.db
      .from("uploads")
      .select("id")
      .eq("id", upload_id)
      .eq("user_id", a.user.id)
      .maybeSingle();
    if (!u)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return await withExpenseLease(a.db, a.user.id, async () => {
      await rebuildUpload(a.db, a.user.id, u.id);
      const { error } = await a.db
        .from("import_drafts")
        .update({
          status: "complete",
          run_id: null,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", a.user.id)
        .eq("upload_id", u.id);
      if (error) throw error;
      return NextResponse.json({ complete: true });
    });
  } catch (e) {
    if (e instanceof BusyError)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return importFailure(e);
  }
}
