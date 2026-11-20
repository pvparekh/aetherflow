import { NextResponse } from "next/server";
import { importAccess, importFailure } from "@/lib/imports/access";
import { validateReview } from "@/lib/imports/contract";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, context: Context) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  try {
    const body = await req.json();
    const review = validateReview(body.review);
    const { data: prior, error } = await a.db
      .from("import_drafts")
      .select("*")
      .eq("id", id)
      .eq("user_id", a.user.id)
      .single();
    if (error || !prior)
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    if (prior.upload_id || prior.status === "processing" || prior.cursor > 0)
      return NextResponse.json(
        {
          error: "Import is already committing. Resume it instead of editing.",
        },
        { status: 409 },
      );
    const originals = new Map(
      prior.review.rows.map(
        (r: {
          id: string;
          source: string;
          page: number | null;
          warnings: string[];
        }) => [r.id, r],
      ),
    );
    if (
      review.rows.length !== prior.review.rows.length ||
      review.rows.some((r) => !originals.has(r.id))
    )
      return NextResponse.json(
        { error: "Original candidate identities must be preserved" },
        { status: 400 },
      );
    review.rows = review.rows.map((r) => ({
      ...r,
      ...Object.fromEntries(
        Object.entries(originals.get(r.id) as object).filter(([k]) =>
          ["source", "page", "warnings", "currency"].includes(k),
        ),
      ),
    }));
    validateReview(review);
    review.filename = prior.review.filename;
    review.options = prior.review.options;
    review.pages = prior.review.pages;
    review.method = prior.review.method;
    const { data, error: updateError } = await a.db
      .from("import_drafts")
      .update({
        review,
        status: "review",
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", id)
      .eq("user_id", a.user.id)
      .eq("updated_at", body.updated_at)
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!data)
      return NextResponse.json(
        { error: "This review changed in another tab. Reload before saving." },
        { status: 409 },
      );
    return NextResponse.json(
      { draft: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof Error)
      return NextResponse.json({ error: e.message }, { status: 400 });
    return importFailure(e);
  }
}
export async function DELETE(_req: Request, context: Context) {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await context.params;
  const { error } = await a.db
    .from("import_drafts")
    .delete()
    .eq("id", id)
    .eq("user_id", a.user.id)
    .is("upload_id", null)
    .neq("status", "processing");
  return error ? importFailure(error) : NextResponse.json({ deleted: true });
}
