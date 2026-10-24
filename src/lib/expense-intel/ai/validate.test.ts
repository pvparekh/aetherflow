import { it, expect } from "vitest";
import { validateAnalysis } from "./validate";
const valid = {
  health_score: 8,
  health_justification: "Limited sample",
  narrative_summary: "Review source records.",
  insights: [
    {
      title: "Summary",
      description: "USD expenses",
      severity: "info",
      category: null,
      metric: "$10",
    },
  ],
  savings_opportunities: [],
  anomaly_explanations: [],
};
it("validates nested model schema and rejects non-finite scores and invented transaction output", () => {
  expect(validateAnalysis(valid).health_score).toBe(8);
  expect(() =>
    validateAnalysis({ ...valid, health_score: Infinity }),
  ).toThrow();
  expect(() => validateAnalysis({ ...valid, insights: [null] })).toThrow();
  expect(() =>
    validateAnalysis({
      ...valid,
      insights: [{ ...valid.insights[0], severity: "safe" }],
    }),
  ).toThrow();
  expect(() =>
    validateAnalysis({ ...valid, anomaly_explanations: [{}] }),
  ).toThrow();
});
