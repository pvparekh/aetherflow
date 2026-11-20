// Monthly budgets per category.
//   GET    ?month=YYYY-MM  budgets with progress for that month (default: the
//                          month of the user's latest transaction)
//   PUT    { category, monthly_target }  create or replace a budget
//   DELETE ?category=...   remove a budget
import { importAccess, importFailure } from "@/lib/imports/access";
import { loadUserTxns } from "@/lib/expense-intel/txns";
import {
  budgetProgress,
  defaultBudgetMonth,
  isCategory,
  isMonth,
  parseBudgetInput,
} from "@/lib/expense-intel/budgets";
import {
  deleteBudget,
  listBudgets,
  upsertBudget,
} from "@/lib/expense-intel/budgets/store";
import { errorJson, privateJson, readJson } from "@/lib/expense-intel/budgets/http";

function unauthenticated() {
  return errorJson("Authentication required", 401);
}

export async function GET(req: Request) {
  const access = await importAccess();
  if (!access) return unauthenticated();

  const requestedMonth = new URL(req.url).searchParams.get("month");
  if (requestedMonth !== null && !isMonth(requestedMonth))
    return errorJson("Month must look like 2026-10", 400);

  try {
    const [budgets, txns] = await Promise.all([
      listBudgets(access.db, access.user.id),
      loadUserTxns(access.db, access.user.id),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const month = requestedMonth ?? defaultBudgetMonth(txns, today);
    return privateJson({
      month,
      asOf: today,
      budgets: budgetProgress(txns, budgets, month, today),
    });
  } catch (e) {
    return importFailure(e);
  }
}

export async function PUT(req: Request) {
  const access = await importAccess();
  if (!access) return unauthenticated();

  const input = parseBudgetInput(await readJson(req));
  if (!input.ok) return errorJson(input.error, 400);

  try {
    const budget = await upsertBudget(access.db, access.user.id, input.value);
    return privateJson({ budget });
  } catch (e) {
    return importFailure(e);
  }
}

export async function DELETE(req: Request) {
  const access = await importAccess();
  if (!access) return unauthenticated();

  const category = new URL(req.url).searchParams.get("category");
  if (!isCategory(category)) return errorJson("Choose a valid category", 400);

  try {
    const deleted = await deleteBudget(access.db, access.user.id, category);
    if (!deleted) return errorJson("Budget not found", 404);
    return privateJson({ deleted: true, category });
  } catch (e) {
    return importFailure(e);
  }
}
