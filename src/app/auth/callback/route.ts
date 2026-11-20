import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";

/** Only same-site paths, so a crafted link can't redirect elsewhere. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/expense-intel";
}

// Email confirmation, password reset and Google sign-in all land here with a
// one-time code, then continue to `next`.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));
  }
  return NextResponse.redirect(new URL("/login?auth=expired", url.origin));
}
