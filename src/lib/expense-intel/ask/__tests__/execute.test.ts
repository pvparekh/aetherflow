import { describe, expect, it } from "vitest";
import { runQuery, type RunOptions } from "../execute";
import { query, reportWith, TODAY, TXNS } from "./fixtures";

const run = (q: Parameters<typeof query>[0], options: RunOptions = { today: TODAY }) =>
  runQuery(TXNS, query(q), options);
const values = (rows: { label: string; value: number }[]) =>
  rows.map((r) => [r.label, r.value]);

describe("metrics without grouping", () => {
  it("sums every expense", () => {
    const r = run({ metric: "sum" });
    expect(r.rows).toEqual([
      expect.objectContaining({ key: "all", value: 704.24, count: 9, total: 704.24 }),
    ]);
    expect(r.overall).toMatchObject({ count: 9, total: 704.24 });
  });

  it("counts, averages and finds the largest within a category", () => {
    const food = { categories: ["Food/Dining" as const] };
    expect(run({ metric: "count", filters: food }).rows[0].value).toBe(3);
    expect(run({ metric: "average", filters: food }).rows[0].value).toBe(50.25);
    const max = run({ metric: "max", filters: food }).rows[0];
    expect(max).toMatchObject({ value: 82.4, transactionId: "t4" });
  });

  it("lists individual expenses, sorted and limited", () => {
    const r = run({ metric: "list", sort: "newest", limit: 2 });
    expect(r.rows.map((row) => row.transactionId)).toEqual(["t8", "t5"]);
    expect(r.totalRows).toBe(9);
    expect(r.overall.total).toBe(704.24);
    expect(run({ metric: "list", sort: "value_desc", limit: 1 }).rows[0].label).toBe("Delta");
    expect(run({ metric: "list", sort: "oldest", limit: 1 }).rows[0].transactionId).toBe("t9");
  });
});

describe("grouping", () => {
  it("groups by category", () => {
    expect(values(run({ groupBy: "category" }).rows)).toEqual([
      ["Travel/Transport", 438.5],
      ["Food/Dining", 150.75],
      ["Office/Supplies", 64.99],
      ["Software/SaaS", 50],
    ]);
  });

  it("groups by vendor key and labels with the vendor name", () => {
    const r = run({ groupBy: "vendor", limit: 3 });
    expect(values(r.rows)).toEqual([["Delta", 420], ["Whole Foods", 123.5], ["Staples", 64.99]]);
    expect(r.rows[1].key).toBe("wholefoods");
    expect(r.totalRows).toBe(6);
  });

  it("groups by month, oldest first, across the data span", () => {
    const r = run({ groupBy: "month", sort: "oldest" });
    expect(values(r.rows)).toEqual([
      ["June 2026", 64.99],
      ["July 2026", 18.5],
      ["August 2026", 15],
      ["September 2026", 435],
      ["October 2026", 170.75],
    ]);
  });

  it("shows months with no matching spending as zero for totals and counts", () => {
    const software = { categories: ["Software/SaaS" as const] };
    const sums = run({ groupBy: "month", sort: "oldest", filters: software }).rows;
    expect(sums.map((r) => r.value)).toEqual([0, 0, 15, 15, 20]);
    const counts = run({ metric: "count", groupBy: "month", sort: "oldest", filters: software }).rows;
    expect(counts.map((r) => r.value)).toEqual([0, 0, 1, 1, 1]);
    // An average or maximum of nothing is not zero, so empty months are left out.
    const averages = run({ metric: "average", groupBy: "month", sort: "oldest", filters: software });
    expect(averages.rows.map((r) => r.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("reports the largest expense per group", () => {
    const travel = run({ metric: "max", groupBy: "category" }).rows[0];
    expect(travel).toMatchObject({ label: "Travel/Transport", value: 420, transactionId: "t6" });
  });

  it("sorts groups by value ascending or by their latest charge", () => {
    expect(run({ groupBy: "category", sort: "value_asc" }).rows[0].label).toBe("Software/SaaS");
    expect(run({ groupBy: "vendor", sort: "newest" }).rows[0].label).toBe("Uber Eats");
  });
});

describe("filters", () => {
  it("resolves relative periods against today", () => {
    expect(run({ filters: { period: "last_month" } }).overall.total).toBe(170.75);
    expect(run({ filters: { period: "custom", dateFrom: "2026-09-01", dateTo: "2026-09-30" } }).overall.total).toBe(435);
    expect(run({ filters: { period: "custom", dateFrom: "2026-10-01", dateTo: null } }).overall.count).toBe(4);
  });

  it("defaults today to the latest expense date", () => {
    const r = runQuery(TXNS, query({ filters: { period: "last_month" } }));
    expect(r.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.overall.total).toBe(435);
  });

  it("matches vendor text loosely on name and key", () => {
    expect(run({ filters: { vendorText: "uber" } }).overall.total).toBe(45.75);
    expect(run({ filters: { vendorText: "UBER EATS" } }).overall.total).toBe(27.25);
    expect(run({ filters: { vendorText: "wholefoods" } }).overall.count).toBe(2);
  });

  it("applies inclusive amount bounds", () => {
    const r = run({ filters: { minAmount: 20, maxAmount: 82.4 } });
    expect(r.transactions.map((t) => t.id).sort()).toEqual(["t3", "t4", "t5", "t8", "t9"]);
  });

  it("uses the leak report for recurring charges when given", () => {
    const r = run({ filters: { recurringOnly: true } }, { today: TODAY, report: reportWith(["t6", "t7"]) });
    expect(r.recurringSource).toBe("leak_report");
    expect(r.overall.total).toBe(438.5);
  });

  it("falls back to vendors charged in 3 or more months without a report", () => {
    const r = run({ filters: { recurringOnly: true } });
    expect(r.recurringSource).toBe("repeat_months");
    expect(r.transactions.map((t) => t.vendor)).toEqual(["Figma", "Figma", "Figma"]);
    expect(run({}).recurringSource).toBeNull();
  });

  it("returns no rows when nothing matches", () => {
    const r = run({ groupBy: "month", filters: { categories: ["Entertainment"] } });
    expect(r.rows).toEqual([]);
    expect(r.overall).toEqual({ count: 0, total: 0, average: 0, largest: null });
  });
});

describe("purity", () => {
  it("does not mutate its input and is deterministic", () => {
    const before = JSON.stringify(TXNS);
    const q = query({ groupBy: "vendor", metric: "average" });
    expect(runQuery(TXNS, q, { today: TODAY })).toEqual(runQuery([...TXNS].reverse(), q, { today: TODAY }));
    expect(JSON.stringify(TXNS)).toBe(before);
  });

  it("handles a user with no expenses", () => {
    const r = runQuery([], query({ groupBy: "month" }), { today: TODAY });
    expect(r).toMatchObject({ rows: [], dataSpan: null, totalRows: 0 });
  });
});
