import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { importAccess, importFailure } from "@/lib/imports/access";
import { parseTextReview } from "@/lib/imports/parse";
import { parsePdfReview } from "@/lib/imports/pdf";
import {
  MAX_BYTES,
  DEFAULT_OPTIONS,
  type ImportOptions,
} from "@/lib/imports/contract";
import { withExpenseLease, BusyError } from "@/lib/imports/lease";
export const maxDuration = 300;
export async function POST(req: Request) {
  const access = await importAccess();
  if (!access)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
      return NextResponse.json(
        { error: "Choose a CSV, TXT or PDF up to 4 MB." },
        { status: 400 },
      );
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "txt", "pdf"].includes(ext ?? ""))
      return NextResponse.json(
        { error: "Unsupported format" },
        { status: 415 },
      );
    const options: ImportOptions = JSON.parse(
      String(form.get("options") ?? JSON.stringify(DEFAULT_OPTIONS)),
    );
    if (
      !["expenses", "negative-outflow", "positive-outflow"].includes(
        options.amountMode,
      ) ||
      !["mdy", "dmy"].includes(options.dateOrder) ||
      options.currency !== "USD"
    )
      return NextResponse.json(
        { error: "Invalid import settings" },
        { status: 400 },
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    const fingerprint = createHash("sha256")
      .update(buffer)
      .update(JSON.stringify(options))
      .digest("hex");
    const { data: prior, error: lookupError } = await access.db
      .from("import_drafts")
      .select("*")
      .eq("user_id", access.user.id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (prior)
      return NextResponse.json(
        { draft: prior, reused: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    return await withExpenseLease(
      access.db,
      access.user.id,
      async () => {
        const { data: admitted, error: budgetError } = await access.db.rpc(
          "admit_expense_extraction",
          { p_owner: access.user.id },
        );
        if (budgetError) throw budgetError;
        if (!admitted)
          return NextResponse.json(
            {
              error:
                "Extraction limit reached (20 attempts per hour). Your saved reviews are still available.",
            },
            { status: 429, headers: { "Retry-After": "3600" } },
          );
        let review;
        try {
          review =
            ext === "pdf"
              ? await parsePdfReview(buffer, file.name, options)
              : parseTextReview(
                  new TextDecoder("utf-8", { fatal: true }).decode(buffer),
                  file.name,
                  options,
                );
        } catch (e) {
          return NextResponse.json(
            {
              error:
                e instanceof Error ? e.message : "Could not extract this file",
            },
            { status: 422 },
          );
        }
        const { error } = await access.db
          .from("import_drafts")
          .upsert(
            { user_id: access.user.id, fingerprint, review },
            { onConflict: "user_id,fingerprint", ignoreDuplicates: true },
          );
        if (error) throw error;
        const { data: draft, error: readError } = await access.db
          .from("import_drafts")
          .select("*")
          .eq("user_id", access.user.id)
          .eq("fingerprint", fingerprint)
          .single();
        if (readError) throw readError;
        return NextResponse.json(
          { draft },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      "extraction",
    );
  } catch (e) {
    if (e instanceof BusyError)
      return NextResponse.json(
        { error: "Another file is being extracted. Wait before retrying." },
        { status: 409 },
      );
    return importFailure(e);
  }
}
