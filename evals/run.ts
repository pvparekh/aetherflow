// Categorisation eval harness: `npm run eval [-- --batch 10 --label "..." --limit 50 --no-write]`
//
// Runs the categoriser that ships (not a copy of its prompt) over the golden
// set, against whatever provider the environment configures (see
// src/lib/llm/index.ts), and prepends a run to evals/results/latest.json.
//
// This calls a model. It is a manual command: CI runs only `npm run eval:ci`,
// which is deterministic and offline. The harness refuses to run when `CI` is
// set unless `--allow-ci` is passed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EvalReport, EvalRun } from "@/lib/expense-intel/contracts";
import { llmConfig } from "@/lib/llm";
import { categorizeRows } from "@/lib/expense-intel/pass1/categorizer";
import type { ParsedRow } from "@/lib/expense-intel/types";
import { loadGolden } from "./lib/golden";
import { buildRun, runBatches, toOrigin, type Categorised, type RowOutcome } from "./lib/harness";
import { confusion } from "./lib/metrics";

const RESULTS_PATH = path.resolve("evals", "results", "latest.json");
const MAX_RUNS_KEPT = 20;
const DEFAULT_BATCH = 25;

/**
 * Adapter: the only place the harness touches the categoriser.
 *
 * Calls the shipped entry point with no merchant rules or history, so the run
 * measures cold-start model quality: the hardest case, a brand-new user.
 * `runBatches` already slices the golden set, so each call is one batch.
 */
async function categorise(rows: ParsedRow[]): Promise<Categorised[]> {
  const items = await categorizeRows(rows, undefined, { batchSize: rows.length });
  return items.map((item) => ({
    category: item.category,
    origin: toOrigin(item.origin, item.subcategory ?? ""),
  }));
}

interface Options {
  batch: number;
  label: string | null;
  limit: number | null;
  write: boolean;
  allowCi: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { batch: DEFAULT_BATCH, label: null, limit: null, write: true, allowCi: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    const positiveInt = (v: string) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw new Error(`${arg} must be a positive integer`);
      return n;
    };
    if (arg === "--batch") options.batch = positiveInt(value());
    else if (arg === "--limit") options.limit = positiveInt(value());
    else if (arg === "--label") options.label = value();
    else if (arg === "--no-write") options.write = false;
    else if (arg === "--allow-ci") options.allowCi = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

function readReport(rowCount: number): EvalReport {
  const existing: Partial<EvalReport> = existsSync(RESULTS_PATH)
    ? (JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as EvalReport)
    : {};
  return {
    dataset: {
      name: "categorize-golden",
      rows: rowCount,
      description:
        existing.dataset?.description ??
        "Hand-labelled raw bank descriptors across all 9 categories, including ambiguous merchants.",
    },
    runs: Array.isArray(existing.runs) ? existing.runs : [],
  };
}

function printSummary(run: EvalRun, outcomes: RowOutcome[]) {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const c = run.categorisation;
  console.log(`\n${run.label}`);
  console.log(
    `  accuracy ${pct(c.accuracy)}  macro F1 ${pct(c.macroF1)}  schema-valid ${pct(c.schemaValidRate)}  ` +
      `abstain ${pct(c.abstainRate)}  without model ${pct(c.resolvedWithoutModel)}`,
  );
  console.log(`  latency per batch: p50 ${run.latencyMs.p50} ms, p95 ${run.latencyMs.p95} ms`);

  const hard = outcomes.filter((o) => o.row.hard);
  const hardCorrect = hard.filter((o) => o.result?.category === o.row.category).length;
  console.log(`  hard cases: ${hardCorrect}/${hard.length}`);

  console.log("\n  category            precision  recall  support");
  for (const [category, s] of Object.entries(c.perCategory)) {
    console.log(
      `  ${category.padEnd(18)}  ${pct(s.precision).padStart(9)}  ${pct(s.recall).padStart(6)}  ${String(s.support).padStart(7)}`,
    );
  }

  const predictions = outcomes.map(({ row, result }) => ({ expected: row.category, predicted: result?.category ?? null }));
  const mistakes = [...confusion(predictions)].flatMap(([expected, row]) =>
    [...row].filter(([predicted]) => predicted !== expected).map(([predicted, n]) => `${expected} -> ${predicted} (${n})`),
  );
  if (mistakes.length) console.log(`\n  confusions: ${mistakes.join("; ")}`);
  for (const { row, result } of outcomes.filter((o) => o.result?.category !== o.row.category).slice(0, 15)) {
    console.log(`  x ${row.id} "${row.descriptor}": expected ${row.category}, got ${result?.category ?? "nothing"}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.env.CI && !options.allowCi) {
    console.error("npm run eval calls a model and is manual only. CI runs npm run eval:ci. Pass --allow-ci to override.");
    process.exit(1);
  }
  loadEnv();

  const golden = loadGolden();
  const rows = options.limit ? golden.slice(0, options.limit) : golden;
  const config = llmConfig("categorize");
  console.log(
    `Categorising ${rows.length} golden rows with ${config.provider} ${config.model} (${config.baseURL}), batch ${options.batch}`,
  );

  const batchRun = await runBatches(rows, options.batch, categorise, (i, total, ms, error) =>
    console.log(`  batch ${i + 1}/${total} ${error ? `FAILED: ${error}` : "ok"} (${Math.round(ms)} ms)`),
  );
  const label = options.label ?? `${config.provider} ${config.model}, batch ${options.batch}`;
  const run = buildRun(batchRun, config, label);
  printSummary(run, batchRun.outcomes);

  if (!options.write) return;
  if (options.limit) {
    console.log("\nPartial run (--limit): not written to evals/results/latest.json.");
    return;
  }
  const report = readReport(golden.length);
  report.runs = [run, ...report.runs].slice(0, MAX_RUNS_KEPT);
  writeFileSync(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), RESULTS_PATH)}`);
}

main().catch((error: unknown) => {
  console.error(`\nEval aborted: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
