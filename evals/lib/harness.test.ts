import { describe, expect, it } from "vitest";
import { LlmUnavailableError } from "@/lib/llm";
import type { ParsedRow } from "@/lib/expense-intel/types";
import type { GoldenRow } from "./golden";
import { buildRun, runBatches, toOrigin, type Categorised } from "./harness";

const row = (id: string, category: GoldenRow["category"], descriptor = id): GoldenRow => ({
  id,
  descriptor,
  amount: 10,
  category,
  vendor: descriptor,
});

const rows: GoldenRow[] = [
  row("a", "Food/Dining"),
  row("b", "Software/SaaS"),
  row("c", "Misc"),
  row("d", "Utilities"),
  row("e", "Food/Dining"),
];

/** Fake categoriser: answers from a lookup by descriptor. */
const answering =
  (answers: Record<string, Categorised>) =>
  async (batch: ParsedRow[]): Promise<Categorised[]> =>
    batch.map((r) => answers[r.vendor]);

const clock = () => {
  let t = 0;
  return () => (t += 100);
};

describe("toOrigin", () => {
  it("trusts an explicit origin and recognises the ladder's fallback", () => {
    expect(toOrigin("rule", "Coffee")).toBe("rule");
    expect(toOrigin("history", "Coffee")).toBe("history");
    expect(toOrigin(undefined, "Needs review")).toBe("fallback");
    expect(toOrigin("model", "Coffee")).toBe("model");
    expect(toOrigin(undefined, "Coffee")).toBe("model");
  });
});

describe("runBatches and buildRun", () => {
  it("scores a run with rules, model answers, a fallback and a failed batch", async () => {
    let call = 0;
    const answers = answering({
      a: { category: "Food/Dining", origin: "rule" },
      b: { category: "Software/SaaS", origin: "model" },
      c: { category: "Misc", origin: "fallback" },
      d: { category: "Software/SaaS", origin: "model" },
    });
    const categorise = async (batch: ParsedRow[]) => {
      call++;
      if (call === 3) throw new Error("Categorization returned invalid output.");
      return answers(batch);
    };

    const batchRun = await runBatches(rows, 2, categorise, undefined, clock());
    expect(batchRun.latencies).toEqual([100, 100, 100]);
    expect(batchRun.outcomes.map((o) => o.result?.origin ?? null)).toEqual(["rule", "model", "fallback", "model", null]);

    const run = buildRun(batchRun, { provider: "ollama", model: "test-model" }, "unit", new Date("2026-11-15T00:00:00Z"));
    expect(run).toMatchObject({
      label: "unit",
      provider: "ollama",
      model: "test-model",
      runAt: "2026-11-15T00:00:00.000Z",
      narrative: null,
      latencyMs: { p50: 100, p95: 100 },
      costPerUploadUsd: 0,
    });
    // Correct: a, b. Abstained: c (fallback) and e (failed batch). Wrong: d.
    expect(run.categorisation.accuracy).toBe(0.4);
    expect(run.categorisation.abstainRate).toBe(0.4);
    expect(run.categorisation.schemaValidRate).toBe(0.6);
    expect(run.categorisation.resolvedWithoutModel).toBe(0.2);
    expect(run.categorisation.perCategory["Food/Dining"]).toEqual({ precision: 1, recall: 0.5, support: 2 });
    expect(Object.keys(run.categorisation.perCategory)).toHaveLength(9);
  });

  it("treats a short answer as a failed batch", async () => {
    const batchRun = await runBatches(rows.slice(0, 2), 2, async () => [{ category: "Misc", origin: "model" }]);
    expect(batchRun.outcomes.every((o) => o.result === null)).toBe(true);
  });

  it("aborts on an unreachable provider instead of recording a run of failures", async () => {
    const unreachable = async () => {
      throw new LlmUnavailableError("Model provider is not reachable", false);
    };
    await expect(runBatches(rows, 2, unreachable)).rejects.toBeInstanceOf(LlmUnavailableError);
    const noKey = async () => {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    };
    await expect(runBatches(rows, 2, noKey)).rejects.toThrow("not set");
  });

  it("records unknown cost for hosted providers", async () => {
    const batchRun = await runBatches(rows.slice(0, 1), 25, answering({ a: { category: "Food/Dining", origin: "model" } }));
    expect(buildRun(batchRun, { provider: "openai", model: "gpt-4o-mini" }, "x").costPerUploadUsd).toBeNull();
  });
});
