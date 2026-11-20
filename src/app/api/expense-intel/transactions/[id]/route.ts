// Tags and a note on one transaction.
//   PATCH { tags?: string[], note?: string | null }
// Only the fields sent are changed. Tags are normalised (see parseTags);
// a null or blank note clears it.
import { importAccess, importFailure } from "@/lib/imports/access";
import { parseAnnotationPatch } from "@/lib/expense-intel/budgets";
import {
  findOwnedLineItem,
  updateAnnotations,
} from "@/lib/expense-intel/budgets/store";
import { errorJson, privateJson, readJson } from "@/lib/expense-intel/budgets/http";

type Context = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return errorJson("Transaction not found", 404);
}

export async function PATCH(req: Request, context: Context) {
  const access = await importAccess();
  if (!access) return errorJson("Authentication required", 401);

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return notFound();

  const patch = parseAnnotationPatch(await readJson(req));
  if (!patch.ok) return errorJson(patch.error, 400);

  try {
    const item = await findOwnedLineItem(access.db, access.user.id, id);
    if (!item) return notFound();
    const transaction = await updateAnnotations(access.db, item, patch.value);
    if (!transaction) return notFound();
    return privateJson({ transaction });
  } catch (e) {
    return importFailure(e);
  }
}
