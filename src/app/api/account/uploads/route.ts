import { NextResponse } from "next/server";
import { importAccess, importFailure } from "@/lib/imports/access";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
export async function DELETE(req: Request) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const body = await req.json().catch(() => ({}));
  if (body.confirmation !== "DELETE")
    return NextResponse.json(
      { error: "Invalid confirmation" },
      { status: 400 },
    );
  try {
    return await withExpenseLease(a.db, a.user.id, async () => {
      const { error } = await a.db.rpc("delete_all_expenses", {
        p_owner: a.user.id,
      });
      if (error) throw error;
      return NextResponse.json({ deleted: true });
    });
  } catch (e) {
    if (e instanceof BusyError)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return importFailure(e);
  }
}
