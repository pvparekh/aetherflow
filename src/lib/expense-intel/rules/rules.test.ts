import { describe, expect, it } from "vitest";
import type { Category } from "../types";
import {
  historyVotes,
  resolveFromRules,
  resolveKnown,
  type CategoryEvidence,
} from "./index";

function evidence(vendorKey: string, ...categories: Category[]): CategoryEvidence[] {
  return categories.map((category) => ({ vendorKey, category }));
}

describe("historyVotes", () => {
  it("needs at least two rows", () => {
    expect(historyVotes(evidence("figma", "Software/SaaS")).size).toBe(0);
    expect(historyVotes(evidence("figma", "Software/SaaS", "Software/SaaS")).get("figma")).toBe(
      "Software/SaaS",
    );
  });

  it("needs at least 75% agreement", () => {
    const threeOfFour = evidence("uber", "Travel/Transport", "Travel/Transport", "Travel/Transport", "Food/Dining");
    const twoOfThree = evidence("costco", "Food/Dining", "Food/Dining", "Office/Supplies");
    const votes = historyVotes([...threeOfFour, ...twoOfThree]);
    expect(votes.get("uber")).toBe("Travel/Transport");
    expect(votes.has("costco")).toBe(false);
  });

  it("ignores rows without a vendor key", () => {
    expect(historyVotes(evidence("", "Misc", "Misc")).size).toBe(0);
  });
});

describe("resolution order", () => {
  const items = [
    { id: "a", vendorKey: "figma" },
    { id: "b", vendorKey: "uber" },
    { id: "c", vendorKey: "unknown cafe" },
    { id: "d", vendorKey: "" },
  ];

  it("resolves items whose vendor key has a rule", () => {
    const resolved = resolveFromRules(items, [{ vendorKey: "figma", category: "Software/SaaS" }]);
    expect([...resolved]).toEqual([["a", "Software/SaaS"]]);
  });

  it("prefers a rule over a history vote and leaves the rest for the model", () => {
    const resolved = resolveKnown(items, {
      rules: [{ vendorKey: "figma", category: "Office/Supplies" }],
      votes: new Map<string, Category>([
        ["figma", "Software/SaaS"],
        ["uber", "Travel/Transport"],
      ]),
    });
    expect(Object.fromEntries(resolved)).toEqual({
      a: { category: "Office/Supplies", origin: "rule" },
      b: { category: "Travel/Transport", origin: "history" },
    });
  });
});
