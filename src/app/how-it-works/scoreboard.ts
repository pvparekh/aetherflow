// Eval scoreboard data for the public "How it works" page.
//
// Reads evals/results/latest.json at build time. Every figure shown on the
// page is derived here, in code, from that file; nothing is typed in by hand.
import latest from "../../../evals/results/latest.json";
import type { EvalReport, EvalRun } from "@/lib/expense-intel/contracts";
import { CATEGORIES } from "@/lib/expense-intel/types";

export const report: EvalReport = latest;

export interface CategoryRow {
  category: string;
  precision: number;
  recall: number;
  support: number;
  /** Golden rows of this category the model labelled as something else. */
  missed: number;
  /** Rows of other categories the model labelled as this one. */
  extra: number;
}

export interface Scoreboard {
  run: EvalRun;
  datasetRows: number;
  correct: number;
  categories: CategoryRow[];
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function runDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Builds the scoreboard from the most recent run (the harness prepends runs). Missed and extra counts are
 * reconstructed from precision, recall and support (tp = recall x support,
 * predicted = tp / precision), rounded to whole rows.
 */
export function buildScoreboard(source: EvalReport = report): Scoreboard {
  const run = source.runs[0];
  const known = new Set<string>(CATEGORIES);
  const names = [
    ...CATEGORIES.filter((c) => c in run.categorisation.perCategory),
    ...Object.keys(run.categorisation.perCategory).filter((c) => !known.has(c)),
  ];
  const categories = names.map((category) => {
    const { precision, recall, support } = run.categorisation.perCategory[category];
    const truePositives = Math.round(recall * support);
    const predicted = precision > 0 ? Math.round(truePositives / precision) : truePositives;
    return {
      category,
      precision,
      recall,
      support,
      missed: support - truePositives,
      extra: predicted - truePositives,
    };
  });
  return {
    run,
    datasetRows: source.dataset.rows,
    correct: Math.round(run.categorisation.accuracy * source.dataset.rows),
    categories,
  };
}

/** Categories sorted by a count, largest first, keeping only non-zero ones. */
export function topBy(rows: CategoryRow[], key: "missed" | "extra", n: number): CategoryRow[] {
  return rows
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, n);
}
