// eval:ci — the golden set is well-formed, stratified and independent of the demo data.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/demo";
import type { EvalReport } from "@/lib/expense-intel/contracts";
import { CATEGORIES } from "@/lib/expense-intel/types";
import { coverageProblems, GoldenSetError, loadGolden, parseGolden } from "../lib/golden";

const golden = loadGolden();

describe("golden set", () => {
  it("parses and validates", () => {
    expect(golden.length).toBeGreaterThan(0);
  });

  it("has at least 200 rows and 15 per category", () => {
    expect(coverageProblems(golden)).toEqual([]);
  });

  it("includes hard cases in every category, each explained", () => {
    for (const category of CATEGORIES) {
      expect(golden.filter((r) => r.category === category && r.hard).length, category).toBeGreaterThanOrEqual(2);
    }
    const unexplainedAmbiguity = golden.filter(
      (r) => /amazon|amzn|costco|apple/i.test(r.descriptor) && !r.notes,
    );
    expect(unexplainedAmbiguity.map((r) => r.id)).toEqual([]);
  });

  it("ids are prefixed by category", () => {
    const prefixes: Record<string, string> = {
      food: "Food/Dining",
      travel: "Travel/Transport",
      lodging: "Accommodation",
      software: "Software/SaaS",
      office: "Office/Supplies",
      marketing: "Marketing/Ads",
      ent: "Entertainment",
      util: "Utilities",
      misc: "Misc",
    };
    for (const row of golden) {
      expect(prefixes[row.id.split("-")[0]], row.id).toBe(row.category);
    }
  });

  it("does not copy demo rows verbatim", () => {
    const demoDescriptors = new Set(demoRows().map((r) => r.descriptor));
    expect(golden.filter((r) => demoDescriptors.has(r.descriptor)).map((r) => r.id)).toEqual([]);
  });

  it("the committed results file matches the EvalReport shape", () => {
    const report = JSON.parse(
      readFileSync(path.resolve("evals", "results", "latest.json"), "utf8"),
    ) as EvalReport;
    expect(report.dataset.name).toBe("categorize-golden");
    expect(Array.isArray(report.runs)).toBe(true);
    expect(report.dataset.rows).toBe(golden.length);
    for (const run of report.runs) {
      expect(Object.keys(run.categorisation.perCategory).sort()).toEqual([...CATEGORIES].sort());
      expect(run.categorisation.accuracy).toBeGreaterThanOrEqual(0);
      expect(run.categorisation.accuracy).toBeLessThanOrEqual(1);
    }
  });
});

describe("golden set validator", () => {
  const valid = { id: "misc-1", descriptor: "X", amount: 1, category: "Misc", vendor: "X" };
  const problemsOf = (lines: unknown[]) => {
    try {
      parseGolden(lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"));
      return [];
    } catch (error) {
      if (error instanceof GoldenSetError) return error.problems;
      throw error;
    }
  };

  it("accepts a valid row and skips blank lines", () => {
    expect(problemsOf([valid, ""])).toEqual([]);
  });

  it("reports every problem with its line number", () => {
    const problems = problemsOf([
      valid,
      "{not json",
      { ...valid, id: "misc-2", category: "Groceries" },
      { ...valid, id: "misc-3", descriptor: "Y", amount: -4 },
      { ...valid, id: "misc-4", descriptor: "Z", amount: 1.234 },
      { ...valid, id: "misc-5", descriptor: "W", extra: 1 },
      { ...valid, descriptor: "V" },
    ]);
    expect(problems).toEqual([
      "line 2: not valid JSON",
      expect.stringContaining('line 3: "category" "Groceries"'),
      'line 4: "amount" must be a positive number',
      'line 5: "amount" has more than 2 decimals',
      'line 6: unknown key "extra"',
      'duplicate id "misc-1" (2 rows)',
    ]);
  });

  it("rejects duplicate descriptors", () => {
    expect(problemsOf([valid, { ...valid, id: "misc-2" }])).toEqual(['duplicate descriptor "X" (2 rows)']);
  });
});
