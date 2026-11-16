import { NextResponse } from "next/server";
import { importAccess } from "@/lib/imports/access";
import { loadUserTxns } from "@/lib/expense-intel/txns";
import { buildLeakReport } from "@/lib/expense-intel/leaks";
import { draftCancellation, draftNegotiation } from "@/lib/expense-intel/actions/drafts";
import { findGuideEntry } from "@/lib/expense-intel/actions/cancel-guide";
import type { DraftKind } from "@/lib/expense-intel/contracts";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_STREAM_KEY = 200;

interface DraftRequest {
  kind: DraftKind;
  streamKey: string;
}

function parseRequest(body: unknown): DraftRequest | null {
  const { kind, streamKey } = (body ?? {}) as Record<string, unknown>;
  if (kind !== "cancel" && kind !== "negotiate") return null;
  if (typeof streamKey !== "string" || !streamKey.trim() || streamKey.length > MAX_STREAM_KEY) return null;
  return { kind, streamKey };
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(req: Request) {
  const access = await importAccess();
  if (!access) return error("Authentication required", 401);

  const request = parseRequest(await req.json().catch(() => null));
  if (!request) return error('Send { kind: "cancel" | "negotiate", streamKey }', 400);

  let txns;
  try {
    txns = await loadUserTxns(access.db, access.user.id);
  } catch {
    return error("Your transactions could not be loaded. Retry in a moment.", 503);
  }

  const report = buildLeakReport(txns, new Date().toISOString().slice(0, 10));
  const stream = report.subscriptions.find((s) => s.key === request.streamKey);
  if (!stream) return error("Subscription not found", 404);

  const guide = findGuideEntry(stream.vendorKey);
  const draft =
    request.kind === "cancel"
      ? await draftCancellation(stream, guide)
      : await draftNegotiation(stream, report.priceChanges.find((p) => p.streamKey === stream.key) ?? null, guide);
  return NextResponse.json(draft, { headers: NO_STORE });
}
