import { NextResponse } from "next/server";
import { importAccess } from "@/lib/imports/access";
import { loadUserTxns } from "@/lib/expense-intel/txns";
import { buildLeakReport, toIcs } from "@/lib/expense-intel/leaks";

const APP_NAME = "Aether Flow";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await importAccess();
  if (!access)
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: NO_STORE });
  try {
    const txns = await loadUserTxns(access.db, access.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const calendar = toIcs(buildLeakReport(txns, today), APP_NAME);
    return new Response(calendar, {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aether-flow-bills.ics"',
      },
    });
  } catch (error) {
    console.error("[calendar] export_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: "Your bill calendar could not be built right now. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}
