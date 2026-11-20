import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (
      await createClient()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/expense-intel", url.origin));
  }
  return NextResponse.redirect(new URL("/login?auth=expired", url.origin));
}
