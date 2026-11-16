// Batch runner and scoring for the categorisation eval. The categoriser is
// injected, so this is testable offline; evals/run.ts wires in the real one.
import type { EvalRun } from "@/lib/expense-intel/contracts";
import { LlmUnavailableError, type LlmConfig } from "@/lib/llm";
import { CATEGORIES, type ParsedRow } from "@/lib/expense-intel/types";
import type { GoldenRow } from "./golden";
import { percentile, scoreClassification, type Prediction } from "./metrics";

/** How a row's category was decided (workstream A's `category_origin`). */
export type Origin = "rule" | "history" | "model" | "fallback";

export interface Categorised {
  category: string;
  origin: Origin;
}

export type Categorise = (rows: ParsedRow[]) => Promise<Categorised[]>;

export interface RowOutcome {
  row: GoldenRow;
  /** Null when the whole batch failed. */
  result: Categorised | null;
}

export interface BatchRun {
  outcomes: RowOutcome[];
  /** Wall time per batch, in milliseconds. */
  latencies: number[];
}

export function toOrigin(origin: string | undefined, subcategory: string): Origin {
  if (origin === "rule" || origin === "history" || origin === "fallback") return origin;
  // The failure ladder's last rung files rows under Misc / "Needs review".
  if (/^needs review$/i.test(subcategory.trim())) return "fallback";
  return "model";
}

export function toParsedRow(row: GoldenRow): ParsedRow {
  // No date: the golden set tests merchant understanding, not seasonality.
  return { raw_text: row.descriptor, vendor: row.descriptor, amount: row.amount, transaction_date: null };
}

/** True for errors that invalidate the whole run (unreachable or misconfigured provider). */
export function isFatal(error: unknown): boolean {
  if (error instanceof LlmUnavailableError) return true;
  return error instanceof Error && /environment variable is not set/.test(error.message);
}

/**
 * Runs the golden rows through `categorise` in batches, sequentially (like an
 * upload). A batch that throws a non-fatal error is recorded as failed and
 * the run continues; a fatal error aborts it.
 */
export async function runBatches(
  rows: readonly GoldenRow[],
  batchSize: number,
  categorise: Categorise,
  onBatch: (index: number, total: number, ms: number, error: string | null) => void = () => {},
  now: () => number = () => performance.now(),
): Promise<BatchRun> {
  const outcomes: RowOutcome[] = [];
  const latencies: number[] = [];
  const total = Math.ceil(rows.length / batchSize);
  for (let i = 0; i < total; i++) {
    const batch = rows.slice(i * batchSize, (i + 1) * batchSize);
    const started = now();
    let error: string | null = null;
    try {
      const results = await categorise(batch.map(toParsedRow));
      if (results.length !== batch.length) {
        throw new Error(`expected ${batch.length} items, got ${results.length}`);
      }
      batch.forEach((row, j) => outcomes.push({ row, result: results[j] }));
    } catch (caught) {
      if (isFatal(caught)) throw caught;
      error = caught instanceof Error ? caught.message : String(caught);
      batch.forEach((row) => outcomes.push({ row, result: null }));
    }
    const ms = now() - started;
    latencies.push(ms);
    onBatch(i, total, ms, error);
  }
  return { outcomes, latencies };
}

const share = (outcomes: readonly RowOutcome[], test: (o: RowOutcome) => boolean) =>
  outcomes.length === 0 ? 0 : Math.round((outcomes.filter(test).length / outcomes.length) * 10000) / 10000;

/** Turns a batch run into an `EvalRun`. Fallback rows count as abstentions. */
export function buildRun(
  { outcomes, latencies }: BatchRun,
  config: Pick<LlmConfig, "provider" | "model">,
  label: string,
  runAt: Date = new Date(),
): EvalRun {
  const predictions: Prediction[] = outcomes.map(({ row, result }) => ({
    expected: row.category,
    predicted: result && result.origin !== "fallback" ? result.category : null,
  }));
  const scores = scoreClassification(predictions, CATEGORIES);
  return {
    label,
    provider: config.provider,
    model: config.model,
    runAt: runAt.toISOString(),
    categorisation: {
      accuracy: scores.accuracy,
      macroF1: scores.macroF1,
      // Rows answered by a valid rule or model response: not a failed batch or ladder fallback.
      schemaValidRate: share(outcomes, (o) => o.result !== null && o.result.origin !== "fallback"),
      abstainRate: scores.abstainRate,
      resolvedWithoutModel: share(outcomes, (o) => o.result?.origin === "rule" || o.result?.origin === "history"),
      perCategory: scores.perCategory,
    },
    narrative: null,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
    },
    // Local models cost nothing per upload; hosted pricing is not tracked yet.
    costPerUploadUsd: config.provider === "ollama" ? 0 : null,
  };
}
