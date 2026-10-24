import { createClient } from "../../../utils/supabase/server";
import { createServiceClient } from "../../../utils/supabase/service";
import { NextResponse } from "next/server";
export async function importAccess() {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  return user ? { user, db: createServiceClient() } : null;
}
export function importFailure(error: unknown) {
  const diagnostic =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
          .replace(/[^A-Z0-9_]/g, "")
          .slice(0, 30)
      : error instanceof Error
        ? error.name
        : "unknown";
  console.error("[import] operation_failed", diagnostic);
  return NextResponse.json(
    {
      error:
        "This import could not be processed. Your saved review is available to retry. If this is a new deployment, confirm its database migration is installed.",
    },
    { status: 503 },
  );
}
