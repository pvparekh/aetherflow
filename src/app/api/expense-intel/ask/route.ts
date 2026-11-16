import { NextResponse } from "next/server";
import { importAccess } from "@/lib/imports/access";
import { loadUserTxns } from "@/lib/expense-intel/txns";
import { buildLeakReport } from "@/lib/expense-intel/leaks";
import { LlmUnavailableError } from "@/lib/llm";
import { askSpending, type AskResponse } from "@/lib/expense-intel/ask/service";
import { MAX_QUESTION_LENGTH } from "@/lib/expense-intel/ask/translate";
import { createRateLimiter } from "@/lib/expense-intel/ask/rate-limit";

export const maxDuration = 60;

/** Matching expenses returned with an answer; the rest are summarised by the totals. */
const MAX_TRANSACTIONS = 50;
const limiter = createRateLimiter(10, 60_000);
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

async function readQuestion(req: Request): Promise<string | null> {
  const body: unknown = await req.json().catch(() => null);
  const question =
    typeof body === "object" && body !== null ? (body as { question?: unknown }).question : null;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  return trimmed && trimmed.length <= MAX_QUESTION_LENGTH ? trimmed : null;
}

function serialise(response: AskResponse) {
  if (response.kind === "declined") return response;
  const { result } = response;
  return {
    kind: response.kind,
    answer: response.answer,
    query: result.query,
    range: result.range,
    dataSpan: result.dataSpan,
    rows: result.rows,
    totalRows: result.totalRows,
    overall: {
      count: result.overall.count,
      total: result.overall.total,
      average: result.overall.average,
      largestTransactionId: result.overall.largest?.id ?? null,
    },
    transactions: result.transactions.slice(0, MAX_TRANSACTIONS),
    recurringSource: result.recurringSource,
  };
}

export async function POST(req: Request) {
  const access = await importAccess();
  if (!access) return json({ error: "Authentication required" }, 401);

  const rate = limiter.take(access.user.id);
  if (!rate.allowed)
    return json(
      { error: "Too many questions. Wait a minute and try again." },
      429,
      { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
    );

  const question = await readQuestion(req);
  if (!question)
    return json({ error: `Ask a question of 1 to ${MAX_QUESTION_LENGTH} characters.` }, 400);

  try {
    const txns = await loadUserTxns(access.db, access.user.id);
    const today = new Date().toISOString().slice(0, 10);
    // The leak report defines which charges are recurring for recurringOnly.
    const report = buildLeakReport(txns, today);
    const response = await askSpending(question, txns, { today, report });
    return json(serialise(response));
  } catch (error) {
    // Log the error class only; never the question or the user's data.
    console.error("[ask] failed", error instanceof Error ? error.name : "unknown");
    if (error instanceof LlmUnavailableError)
      return json(
        { error: "The question service is unavailable right now. Try again later; your figures are unaffected." },
        503,
      );
    return json({ error: "Could not answer that question right now." }, 500);
  }
}
