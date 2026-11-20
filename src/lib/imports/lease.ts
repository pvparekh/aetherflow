import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
export class BusyError extends Error {
  constructor() {
    super("Another expense operation is running. Retry shortly.");
  }
}
export async function withExpenseLease<T>(
  db: SupabaseClient,
  owner: string,
  work: () => Promise<T>,
  scope = "expense-write",
): Promise<T> {
  const token = randomUUID();
  const { data, error } = await db.rpc("claim_expense_lease", {
    p_owner: owner,
    p_scope: scope,
    p_token: token,
  });
  if (error) throw error;
  if (!data) throw new BusyError();
  try {
    return await work();
  } finally {
    await db
      .from("expense_leases")
      .delete()
      .eq("user_id", owner)
      .eq("scope", scope)
      .eq("token", token);
  }
}
