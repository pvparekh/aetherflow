// Classification and latency metrics for the eval harness. Pure functions.
import type { CategoryScore } from "@/lib/expense-intel/contracts";

/** One scored row: `predicted` is null when the system abstained or failed. */
export interface Prediction {
  expected: string;
  predicted: string | null;
}

export interface ClassificationScores {
  accuracy: number;
  macroF1: number;
  abstainRate: number;
  perCategory: Record<string, CategoryScore>;
}

const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den);
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Accuracy counts abstentions as wrong (the denominator is every row).
 * Precision for a category with no predictions is 0, as is F1 when both
 * precision and recall are 0. Macro F1 averages over `labels`, so a category
 * the system never predicts drags the score down instead of disappearing.
 */
export function scoreClassification(
  predictions: readonly Prediction[],
  labels: readonly string[],
): ClassificationScores {
  const perCategory: Record<string, CategoryScore> = {};
  let f1Sum = 0;
  for (const label of labels) {
    const tp = predictions.filter((p) => p.expected === label && p.predicted === label).length;
    const predicted = predictions.filter((p) => p.predicted === label).length;
    const support = predictions.filter((p) => p.expected === label).length;
    const precision = ratio(tp, predicted);
    const recall = ratio(tp, support);
    f1Sum += precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perCategory[label] = { precision: round(precision), recall: round(recall), support };
  }
  const correct = predictions.filter((p) => p.predicted === p.expected).length;
  const abstained = predictions.filter((p) => p.predicted === null).length;
  return {
    accuracy: round(ratio(correct, predictions.length)),
    macroF1: round(ratio(f1Sum, labels.length)),
    abstainRate: round(ratio(abstained, predictions.length)),
    perCategory,
  };
}

/** Nearest-rank percentile (p in 0..100). Returns 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** Rows grouped by expected label then predicted label, for the console report. */
export function confusion(predictions: readonly Prediction[]): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  for (const { expected, predicted } of predictions) {
    const row = matrix.get(expected) ?? new Map<string, number>();
    const key = predicted ?? "(abstained)";
    row.set(key, (row.get(key) ?? 0) + 1);
    matrix.set(expected, row);
  }
  return matrix;
}
