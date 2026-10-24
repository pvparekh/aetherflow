import { NextResponse } from "next/server";
import { importAccess, importFailure } from "@/lib/imports/access";
export async function GET() {
  const a = await importAccess();
  if (!a)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { data, error } = await a.db
    .from("import_drafts")
    .select("id,status,review,upload_id,error,updated_at,cursor")
    .eq("user_id", a.user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return importFailure(error);
  return NextResponse.json(
    { drafts: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
