import { describe, expect, it } from "vitest";
import { templateAnswer } from "../answer";
import { runQuery } from "../execute";
import { parseAskQuery } from "../schema";
import { PRESET_QUESTIONS } from "../presets";
import type { AskResult } from "../types";
import { query, TODAY, TXNS } from "./fixtures";

const answer = (q: Parameters<typeof query>[0]) =>
  templateAnswer(runQuery(TXNS, query(q), { today: TODAY })).text;

/** Every figure the executor computed, rounded to cents. */
function computedFigures(result: AskResult): Set<number> {
  const figures = [
    result.totalRows,
    result.rows.length,
    result.overall.count,
    result.overall.total,
    result.overall.average,
    result.overall.largest?.amount ?? 0,
    ...result.rows.flatMap((r) => [r.value, r.count, r.total]),
    ...result.transactions.map((t) => t.amount),
    ...[result.query.filters.minAmount, result.query.filters.maxAmount].filter((n) => n !== null),
    3, // REPEAT_MONTHS_FOR_RECURRING, named in the fallback note
  ];
  if (result.totalRows) figures.push(result.overall.total / result.totalRows);
  return new Set(figures.map((n) => Math.round(n * 100) / 100));
}

/** Numbers in the text, ignoring calendar dates, months and quarters. */
function numbersIn(text: string): number[] {
  const withoutDates = text
    .replace(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}/g, "")
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/g, "")
    .replace(/\bQ\d \d{4}|\bin \d{4}/g, "");
  return [...withoutDates.matchAll(/\d[\d,]*(\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}

describe("templateAnswer", () => {
  it("phrases each metric from the computed values", () => {
    const food = { categories: ["Food/Dining" as const], period: "last_month" as const };
    expect(answer({ filters: food })).toBe(
      "You spent $150.75 across 3 expenses (Food/Dining expenses in October 2026).",
    );
    expect(answer({ metric: "count", filters: food })).toBe(
      "You had 3 expenses (Food/Dining expenses in October 2026), totalling $150.75.",
    );
    expect(answer({ metric: "average", filters: food })).toBe(
      "Your average was $50.25 per expense across 3 expenses (Food/Dining expenses in October 2026).",
    );
    expect(answer({ metric: "max" })).toBe("Your largest was $420.00 at Delta on Sep 14, 2026.");
    expect(answer({ metric: "list", limit: 2 })).toBe("Found 9 expenses totalling $704.24. Showing 2.");
  });

  it("summarises groups", () => {
    expect(answer({ groupBy: "vendor" })).toBe(
      "Highest by total: Delta ($420.00), Whole Foods ($123.50) and Staples ($64.99). 6 vendors in all, $704.24 total.",
    );
    expect(answer({ groupBy: "month", sort: "oldest" })).toBe(
      "Across 5 months you spent $704.24, about $140.85 a month. The highest was September 2026 at $435.00.",
    );
  });

  it("describes vendor, amount and recurring filters", () => {
    expect(answer({ filters: { vendorText: "uber eats" } })).toBe(
      "You spent $27.25 across 1 expense (expenses at Uber Eats).",
    );
    expect(answer({ filters: { vendorText: "uber", minAmount: 20 } })).toContain("of $20.00 or more at Uber Eats");
    expect(answer({ filters: { vendorText: "uber" } })).toContain('at vendors matching "uber"');
    expect(answer({ filters: { recurringOnly: true } })).toBe(
      "You spent $50.00 across 3 expenses (recurring expenses). Recurring here means charged in 3 or more different months.",
    );
  });

  it("says what the data covers when nothing matches", () => {
    expect(answer({ filters: { categories: ["Entertainment"] } })).toBe(
      "No Entertainment expenses matched. Your data covers Jun 10, 2026 to Oct 28, 2026.",
    );
    expect(templateAnswer(runQuery([], query(), { today: TODAY })).text).toBe(
      "You have no expenses uploaded yet.",
    );
  });

  // The numeric half of the faithfulness rule, applied to every query shape.
  it.each(
    (["sum", "count", "average", "max", "list"] as const).flatMap((metric) =>
      (["none", "category", "vendor", "month"] as const).map((groupBy) => [metric, groupBy] as const),
    ),
  )("states only computed figures for %s by %s", (metric, groupBy) => {
    const result = runQuery(TXNS, query({ metric, groupBy, filters: { recurringOnly: groupBy === "vendor" } }), { today: TODAY });
    const allowed = computedFigures(result);
    for (const n of numbersIn(templateAnswer(result).text)) expect(allowed).toContain(n);
  });
});

describe("PRESET_QUESTIONS", () => {
  it("has six valid queries with unique ids", () => {
    expect(PRESET_QUESTIONS).toHaveLength(6);
    expect(new Set(PRESET_QUESTIONS.map((p) => p.id)).size).toBe(6);
    for (const preset of PRESET_QUESTIONS) expect(parseAskQuery(preset.query)).toEqual(preset.query);
  });

  it("runs every preset without a model and answers from computed figures", () => {
    for (const preset of PRESET_QUESTIONS) {
      const result = runQuery(TXNS, preset.query, { today: "2026-10-31" });
      const text = templateAnswer(result).text;
      expect(text.length).toBeGreaterThan(0);
      const allowed = computedFigures(result);
      for (const n of numbersIn(text)) expect(allowed).toContain(n);
    }
  });
});
