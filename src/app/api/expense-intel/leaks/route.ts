import { NextResponse } from "next/server";
import { importAccess } from "@/lib/imports/access";
import { loadUserTxns } from "@/lib/expense-intel/txns";
import { buildLeakReport } from "@/lib/expense-intel/leaks";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const access = await importAccess();
  if (!access)
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: NO_STORE });
  try {
    const txns = await loadUserTxns(access.db, access.user.id);
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json(buildLeakReport(txns, today), { headers: NO_STORE });
  } catch (error) {
    console.error("[leaks] report_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: "Your leak report could not be built right now. Please try again." },
      { status: 503, headers: NO_STORE },
    );
  }
}
