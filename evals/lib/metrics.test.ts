import { describe, expect, it } from "vitest";
import { confusion, percentile, scoreClassification } from "./metrics";

describe("scoreClassification", () => {
  it("scores a perfect run", () => {
    const s = scoreClassification(
      [
        { expected: "A", predicted: "A" },
        { expected: "B", predicted: "B" },
      ],
      ["A", "B"],
    );
    expect(s).toEqual({
      accuracy: 1,
      macroF1: 1,
      abstainRate: 0,
      perCategory: { A: { precision: 1, recall: 1, support: 1 }, B: { precision: 1, recall: 1, support: 1 } },
    });
  });

  it("computes precision, recall and macro F1 by hand-checked example", () => {
    // A: tp 2, predicted 3, support 3 -> P 2/3, R 2/3, F1 2/3
    // B: tp 1, predicted 1, support 2 -> P 1, R 1/2, F1 2/3
    // C: never expected, predicted once -> P 0, R 0, F1 0
    const s = scoreClassification(
      [
        { expected: "A", predicted: "A" },
        { expected: "A", predicted: "A" },
        { expected: "A", predicted: "C" },
        { expected: "B", predicted: "B" },
        { expected: "B", predicted: "A" },
      ],
      ["A", "B", "C"],
    );
    expect(s.accuracy).toBe(0.6);
    expect(s.perCategory.A).toEqual({ precision: 0.6667, recall: 0.6667, support: 3 });
    expect(s.perCategory.B).toEqual({ precision: 1, recall: 0.5, support: 2 });
    expect(s.perCategory.C).toEqual({ precision: 0, recall: 0, support: 0 });
    expect(s.macroF1).toBeCloseTo((2 / 3 + 2 / 3 + 0) / 3, 4);
  });

  it("counts abstentions as wrong and reports their rate", () => {
    const s = scoreClassification(
      [
        { expected: "A", predicted: null },
        { expected: "A", predicted: "A" },
      ],
      ["A"],
    );
    expect(s.accuracy).toBe(0.5);
    expect(s.abstainRate).toBe(0.5);
    expect(s.perCategory.A).toEqual({ precision: 1, recall: 0.5, support: 2 });
  });

  it("handles an empty run without dividing by zero", () => {
    expect(scoreClassification([], ["A"]).accuracy).toBe(0);
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("confusion", () => {
  it("groups predictions by expected then predicted label", () => {
    const m = confusion([
      { expected: "A", predicted: "B" },
      { expected: "A", predicted: "B" },
      { expected: "A", predicted: null },
    ]);
    expect(Object.fromEntries(m.get("A")!)).toEqual({ B: 2, "(abstained)": 1 });
  });
});
