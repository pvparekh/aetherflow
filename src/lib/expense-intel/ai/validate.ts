import { CATEGORIES, type Pass2Result } from "../types";
export function validateAnalysis(value: unknown): Pass2Result {
  if (!value || typeof value !== "object")
    throw new Error("Invalid interpretation");
  const r = value as Pass2Result;
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
