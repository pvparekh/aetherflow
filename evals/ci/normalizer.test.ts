// eval:ci — vendor normaliser accuracy on the golden set's expected display vendors.
//
// A ratchet, not a target: the floor is set just under the current score so
// regressions fail CI. Raise it whenever the normaliser improves (workstream A
// is extending the alias and location tables).
import { describe, expect, it } from "vitest";
import { displayVendor, vendorKey } from "@/lib/expense-intel/normalize";
import { loadGolden, vendorMatches } from "../lib/golden";

// Phase 0 baseline: 46/233 (19.7%). Most misses are city names and legal
// suffixes left in place ("Sephora New York", "Hiscox Inc").
const NORMALIZER_FLOOR = 0.19;

const golden = loadGolden();

describe("vendor normaliser on golden display vendors", () => {
  const results = golden.map((row) => ({
    row,
    actual: displayVendor(row.descriptor),
  }));
  const correct = results.filter((r) => vendorMatches(r.actual, r.row.vendor));
  const accuracy = correct.length / results.length;

  it(`scores ${correct.length}/${results.length} (${(accuracy * 100).toFixed(1)}%), floor ${NORMALIZER_FLOOR * 100}%`, () => {
    const misses = results
      .filter((r) => !vendorMatches(r.actual, r.row.vendor))
      .map((r) => `${r.row.id}: "${r.row.descriptor}" -> "${r.actual}" (expected "${r.row.vendor}")`);
    expect(accuracy, `normaliser misses:\n${misses.join("\n")}`).toBeGreaterThanOrEqual(NORMALIZER_FLOOR);
  });

  it("never returns an empty vendor or key", () => {
    for (const { row, actual } of results) {
      expect(actual.trim(), row.id).not.toBe("");
      expect(vendorKey(row.descriptor), row.id).not.toBe("");
    }
  });
});
