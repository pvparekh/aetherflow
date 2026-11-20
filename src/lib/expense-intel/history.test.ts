import { it, expect } from "vitest";
import { summarizeHistory } from "./history";
it("all-time totals retain categories absent from the latest upload and order history by upload date", () => {
  const result = summarizeHistory(
    [
      { category: "Utilities", upload_id: "older", total_spend_period: 100 },
      { category: "Software/SaaS", upload_id: "newer", total_spend_period: 50 },
    ],
    ["older", "newer"],
  );
  expect(result.map((r) => r.total_spend_alltime)).toEqual([100, 50]);
  expect(result.reduce((s, r) => s + r.total_spend_alltime, 0)).toBe(150);
});
