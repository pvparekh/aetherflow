// Small response helpers shared by the budgets and transaction routes.
import { NextResponse } from "next/server";

/** JSON response that is never cached: every body here is per-user data. */
export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorJson(error: string, status: number) {
  return privateJson({ error }, status);
}

/** The parsed JSON body, or undefined when the body is missing or malformed. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
