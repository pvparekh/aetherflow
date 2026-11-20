import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm")>()),
  completeJson: vi.fn(),
}));

import { completeJson, LlmOutputError, LlmUnavailableError } from "@/lib/llm";
import { buildNarrativeContext, narrativeFacts, type NarrativeInputs } from "./narrative-context";
import { checkNarrative, writeNarrative } from "./narrative";
import { templateNarrative } from "./template";
import { validateAnalysis } from "./validate";
import type { Pass2Result } from "../types";

const mockComplete = vi.mocked(completeJson);

const inputs: NarrativeInputs = {
  totalSpent: 2480.5,
  transactionCount: 37,
  categoryStats: [
    { category: "Food/Dining", total_spend_period: 620, pct_of_total_spend: 25, rolling_avg_5: 600, trend_direction: "stable" },
    { category: "Software/SaaS", total_spend_period: 1450.5, pct_of_total_spend: 58.47, rolling_avg_5: 900, trend_direction: "up" },
    { category: "Travel/Transport", total_spend_period: 410, pct_of_total_spend: 16.53, rolling_avg_5: 0, trend_direction: null },
  ],
  previousCategoryStats: [{ category: "Software/SaaS", total_spend_period: 1000 }],
  items: [
    { category: "Software/SaaS", anomaly_severity: "warning", is_possible_duplicate: true, is_round_number: false, is_first_time_vendor: false },
    { category: "Food/Dining", anomaly_severity: "none", is_possible_duplicate: false, is_round_number: false, is_first_time_vendor: false },
  ],
  vendors: [
    { vendor_name: "Adobe", primary_category: "Software/SaaS", total_spend: 899.94, total_occurrences: 6 },
    { vendor_name: "Figma", primary_category: "Software/SaaS", total_spend: 540, total_occurrences: 12 },
    { vendor_name: "Notion", primary_category: "Software/SaaS", total_spend: 120, total_occurrences: 12 },
    { vendor_name: "Uber", primary_category: "Travel/Transport", total_spend: 410, total_occurrences: 9 },
  ],
};

const ctx = buildNarrativeContext(inputs);
const facts = narrativeFacts(ctx, ["Netflix"]);

function modelNarrative(overrides: Partial<Pass2Result> = {}): Pass2Result {
  return {
    health_score: 6,
    health_justification: "Software/SaaS is running well above usual.",
    narrative_summary: "You spent $2,480.50 across 37 transactions. Software/SaaS is 61% above its recent average of $900.",
    insights: [
      {
        title: "Software/SaaS is running high",
        description: "Adobe leads at $899.94 across 6 charges.",
        severity: "warning",
        category: "Software/SaaS",
        metric: "$1,450.50 vs $900.00 average",
      },
    ],
    savings_opportunities: [],
    anomaly_explanations: [],
    ...overrides,
  };
}

function modelReturns(...values: (Pass2Result | Error)[]) {
  for (const value of values) {
    if (value instanceof Error) mockComplete.mockRejectedValueOnce(value);
    else mockComplete.mockResolvedValueOnce({ value, provider: "ollama", model: "test", latencyMs: 1 });
  }
}

beforeEach(() => mockComplete.mockReset());

describe("buildNarrativeContext", () => {
  it("computes every comparison in code", () => {
    const software = ctx.categories.find((c) => c.category === "Software/SaaS")!;
    expect(ctx.categories[0].category).toBe("Software/SaaS");
    expect(software.vsRecentPct).toBe(61);
    expect(software.vsLastPeriodPct).toBe(45);
    expect(software.flaggedCharges).toBe(1);
    expect(ctx.categoriesRunningHigh).toEqual(["Software/SaaS"]);
    expect(ctx.categories.find((c) => c.category === "Travel/Transport")!.recentAverage).toBeNull();
    expect(ctx.crowdedCategories).toEqual([
      { category: "Software/SaaS", vendorCount: 3, vendors: ["Adobe", "Figma", "Notion"] },
    ]);
    expect(ctx.flags).toEqual({ totalFlagged: 1, possibleDuplicates: 1, newVendorsFlagged: 0, roundNumbers: 0 });
  });
});

describe("templateNarrative", () => {
  it("is valid, plain-spoken and passes its own faithfulness check", () => {
    const result = templateNarrative(ctx);
    expect(() => validateAnalysis(result)).not.toThrow();
    expect(checkNarrative(result, facts)).toEqual({ ok: true, problems: [] });
    expect(result.health_score).toBe(7);
    expect(result.narrative_summary).toBe(
      "You spent $2,480.50 across 37 transactions. Software/SaaS was the largest category at $1,450.50 (58.5% of the total). Software/SaaS is 61% above its recent average of $900.00.",
    );
    expect(result.insights.map((i) => i.title)).toEqual([
      "Software/SaaS is running high",
      "Possible duplicate charges",
      "Charges worth a second look",
      "Adobe is your biggest vendor",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/z-score|baseline|standard deviation/i);
  });

  it("says so when nothing stands out", () => {
    const calm = buildNarrativeContext({ ...inputs, items: [], categoryStats: inputs.categoryStats.slice(0, 1) });
    const result = templateNarrative(calm);
    expect(result.health_score).toBe(9);
    expect(result.insights[0]).toMatchObject({ title: "Nothing unusual this period", severity: "success" });
    expect(checkNarrative(result, narrativeFacts(calm)).ok).toBe(true);
  });
});

describe("checkNarrative", () => {
  it("accepts a faithful model narrative", () => {
    expect(checkNarrative(modelNarrative(), facts)).toEqual({ ok: true, problems: [] });
  });

  it("rejects invented figures, unknown vendors and unsupported category tags", () => {
    const result = checkNarrative(
      modelNarrative({
        narrative_summary: "Cut Netflix to save $300 a year.",
        insights: [{ ...modelNarrative().insights[0], category: "Accommodation" }],
      }),
      facts,
    );
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      'Mentions "Netflix", which is not in the supplied data',
      "Amount $300 is not in the supplied data",
      'Insight is tagged "Accommodation", which is not in the supplied data',
    ]);
  });
});

describe("writeNarrative", () => {
  it("returns the model narrative when it is faithful", async () => {
    modelReturns(modelNarrative());
    const result = await writeNarrative(ctx, { knownNames: ["Netflix"] });
    expect(result.source).toBe("model");
    expect(result.anomaly_explanations).toEqual([]);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    const request = mockComplete.mock.calls[0][0];
    expect(request.task).toBe("narrative");
    expect(request.user).toContain('"vs_recent_pct": 61');
    expect(request.user).not.toContain("line_items");
  });

  it("regenerates once with the problems fed back", async () => {
    modelReturns(modelNarrative({ narrative_summary: "You could save $300." }), modelNarrative());
    const result = await writeNarrative(ctx);
    expect(result.source).toBe("model");
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(mockComplete.mock.calls[1][0].user).toContain("Amount $300 is not in the supplied data");
  });

  it("falls back to the template after two unfaithful answers", async () => {
    const unfaithful = modelNarrative({ narrative_summary: "You could save $300." });
    modelReturns(unfaithful, unfaithful);
    const result = await writeNarrative(ctx);
    expect(result).toEqual({ ...templateNarrative(ctx), source: "template" });
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it("retries invalid output, then uses the template", async () => {
    modelReturns(new LlmOutputError("bad json"), new LlmOutputError("bad json"));
    expect((await writeNarrative(ctx)).source).toBe("template");
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the provider is unavailable", async () => {
    modelReturns(new LlmUnavailableError("Model provider is not reachable", false));
    expect((await writeNarrative(ctx)).source).toBe("template");
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});

describe("validateAnalysis", () => {
  it("keeps a valid source and rejects an unknown one", () => {
    expect(validateAnalysis({ ...modelNarrative(), source: "template" }).source).toBe("template");
    expect(() => validateAnalysis({ ...modelNarrative(), source: "guess" })).toThrow();
  });
});

describe("plainDashes", () => {
  it("turns em dashes and spaced en dashes into commas, keeping ranges", async () => {
    const { plainDashes } = await import("./generate");
    expect(plainDashes({ a: "Adobe went up — by $10.", b: ["Nov–Oct", "fees – again"] })).toEqual({
      a: "Adobe went up, by $10.",
      b: ["Nov–Oct", "fees, again"],
    });
  });
});
