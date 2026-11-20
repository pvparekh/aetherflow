import { CATEGORIES, type Pass2Result } from "../types";

/** Who wrote the narrative: the model (checked for faithfulness) or the template fallback. */
export type NarrativeSource = "model" | "template";

/** `Pass2Result` plus where it came from. `source` is absent on analyses stored before it existed. */
export type NarrativeResult = Pass2Result & { source?: NarrativeSource };

export function validateAnalysis(value: unknown): NarrativeResult {
  if (!value || typeof value !== "object")
    throw new Error("Invalid interpretation");
  const r = value as NarrativeResult;
  const text = (s: unknown) => typeof s === "string" && s.length <= 6000;
  if (
    !Number.isFinite(r.health_score) ||
    !text(r.health_justification) ||
    !text(r.narrative_summary) ||
    !Array.isArray(r.insights) ||
    r.insights.length > 10 ||
    !Array.isArray(r.savings_opportunities) ||
    r.savings_opportunities.length > 10 ||
    !Array.isArray(r.anomaly_explanations) ||
    r.anomaly_explanations.length > 5
  )
    throw new Error("Invalid interpretation schema");
  if (r.source !== undefined && r.source !== "model" && r.source !== "template")
    throw new Error("Invalid narrative source");
  if (
    r.insights.some(
      (i) =>
        !i ||
        !text(i.title) ||
        !text(i.description) ||
        !text(i.metric) ||
        !["success", "info", "warning", "critical"].includes(i.severity) ||
        (i.category !== null && !CATEGORIES.some((c) => c === i.category)),
    )
  )
    throw new Error("Invalid insight");
  if (
    r.savings_opportunities.some(
      (i) =>
        !i ||
        !text(i.title) ||
        !text(i.description) ||
        !text(i.estimated_impact),
    )
  )
    throw new Error("Invalid opportunity");
  // This endpoint supplies aggregates only. Transaction-level explanations have no source.
  if (r.anomaly_explanations.length)
    throw new Error("Ungrounded transaction explanations");
  return {
    ...r,
    health_score: Math.max(1, Math.min(10, Math.round(r.health_score))),
  };
}
